import { Resolvers, OperationResult, ResourceDbObject, UserDbObject, LocalRole, TicketStatusCode, ErrorCode, User, ResourceCard, Ticket, RequestSource, ResourceManagementResult, ResourceNotification, ResourceNotificationDbObject, WebPushSubscription } from "allotr-graphql-schema-types";
import { MongoDBSingleton } from "./mongodb-singleton";
import { ObjectId, ClientSession, Db } from "mongodb";
import { addMSToTime, generateChannelId, getLastQueuePosition, getLastStatus } from "./data-util";
import { NOTIFICATIONS, RESOURCES, USERS } from "../consts/collections";
import { sendNotification } from "../notifications/web-push";
import { RESOURCE_READY_TO_PICK } from "../consts/connection-tokens";
import { RedisSingleton } from "./redis-singleton";
import { VALID_STATUES_MAP } from "src/consts/valid-statuses-map";
async function getUserTicket(userId: string | ObjectId, resourceId: string, myDb?: Db): Promise<ResourceDbObject | null> {
    const db = myDb ?? await MongoDBSingleton.getInstance().db;
    const [parsedUserId, parsedResourceId] = [new ObjectId(userId), new ObjectId(resourceId)];

    const [userTikcet] = await db.collection<ResourceDbObject>(RESOURCES).find({
        _id: parsedResourceId,
        "tickets.user._id": parsedUserId,
        "tickets.statuses.statusCode": {
            $ne: TicketStatusCode.Revoked
        }
    }, {
        projection: {
            "tickets.$": 1,
            name: 1,
            createdBy: 1,
            description: 1,
            maxActiveTickets: 1,
            lastModificationDate: 1,
            _id: 1,
            creationDate: 1,
            activeUserCount: 1
        }
    }).sort({
        lastModificationDate: -1
    }).toArray();

    return userTikcet;
}

async function getResource(resourceId: string): Promise<ResourceDbObject | null> {
    const db = await MongoDBSingleton.getInstance().db;

    const userTikcet = await db.collection<ResourceDbObject>(RESOURCES).findOne({
        _id: new ObjectId(resourceId),
        "tickets.statuses.statusCode": {
            $ne: TicketStatusCode.Revoked
        }
    });

    return userTikcet;
}

async function getAwaitingTicket(resourceId: string): Promise<ResourceDbObject | null> {
    const db = await MongoDBSingleton.getInstance().db;
    const parsedResourceId = new ObjectId(resourceId);
    const [userTikcet] = await db.collection<ResourceDbObject>(RESOURCES).find({
        _id: parsedResourceId,
        "tickets.statuses.statusCode": TicketStatusCode.AwaitingConfirmation
    }, {
        projection: {
            "tickets.$": 1,
            name: 1,
            createdBy: 1,
            description: 1,
            maxActiveTickets: 1,
            lastModificationDate: 1,
            _id: 1,
            creationDate: 1,
            activeUserCount: 1
        }
    }).sort({
        lastModificationDate: -1
    }).toArray();

    return userTikcet;
}


async function getUser(userId?: ObjectId | null): Promise<UserDbObject | null> {
    const db = await MongoDBSingleton.getInstance().db;
    const userTikcet = await db.collection<UserDbObject>(USERS).findOne({
        _id: userId,
    })

    return userTikcet;
}



// Resource Utils
async function pushNewStatus(
    resourceId: string,
    ticketId: ObjectId | undefined | null,
    {
        statusCode,
        timestamp,
        queuePosition
    }: {
        statusCode: TicketStatusCode,
        timestamp: Date,
        queuePosition?: number
    },
    executionPosition: number,
    session: ClientSession,
    previousStatus?: TicketStatusCode) {

    const db = await MongoDBSingleton.getInstance().db;
    // Add 1ms to make sure the statuses are in order
    const newTimestamp = addMSToTime(timestamp, executionPosition)

    const increment: Record<TicketStatusCode, number> = {
        ACTIVE: 1,
        INACTIVE: previousStatus === TicketStatusCode.Active ? -1 : 0,
        AWAITING_CONFIRMATION: 0,
        INITIALIZED: 0,
        QUEUED: 0,
        REQUESTING: 0,
        REVOKED: 0
    }

    await db.collection(RESOURCES).updateOne({ _id: new ObjectId(resourceId) }, {
        $inc: {
            activeUserCount: increment[statusCode]
        },
        $set: {
            lastModificationDate: newTimestamp
        },
        $push: {
            "tickets.$[myTicket].statuses": { statusCode, timestamp: newTimestamp, queuePosition }
        }
    }, {
        session,
        arrayFilters: [
            {
                "myTicket._id": ticketId
            },
        ],
    })

}

async function enqueue(
    resourceId: string,
    ticketId: ObjectId | undefined | null,
    currentDate: Date,
    executionPosition: number,
    session: ClientSession
) {
    const resource = await getResource(resourceId)
    const db = await MongoDBSingleton.getInstance().db;
    const timestamp = addMSToTime(currentDate, executionPosition)

    await db.collection(RESOURCES).updateOne({ _id: new ObjectId(resourceId) }, {
        $set: {
            lastModificationDate: currentDate
        },
        $push: {
            "tickets.$[myTicket].statuses": {
                statusCode: TicketStatusCode.Queued,
                timestamp,
                queuePosition: getLastQueuePosition(resource?.tickets) + 1
            }
        }
    }, {
        session,
        arrayFilters: [
            {
                "myTicket._id": ticketId
            },
        ],
    })
}

async function forwardQueue(
    resourceId: string,
    currentDate: Date,
    executionPosition: number,
    session: ClientSession,
    myDb?: Db
) {
    const db = myDb ?? await MongoDBSingleton.getInstance().db;
    const timestamp = addMSToTime(currentDate, executionPosition)

    await db.collection(RESOURCES).updateOne({
        _id: new ObjectId(resourceId)
    }, {
        $set: {
            lastModificationDate: timestamp,
            "tickets.$[].statuses.$[myStatus].timestamp": timestamp
        },
        $inc: {
            activeUserCount: 0,
            "tickets.$[].statuses.$[myStatus].queuePosition": -1
        }
    }, {
        session,
        arrayFilters: [
            {
                "myStatus.queuePosition": { $nin: [null, 0] }
            },
        ],
    })
}

async function removeAwaitingConfirmation(
    resourceId: string,
    currentDate: Date,
    executionPosition: number,
    session: ClientSession) {
    const db = await MongoDBSingleton.getInstance().db;
    // Add 1ms to make sure the statuses are in order
    const timestamp = addMSToTime(currentDate, executionPosition)
    // Delete notification
    const userId = (await getAwaitingTicket(resourceId))?.tickets?.[0].user?._id;
    console.log({ userId, resourceId });
    const result2 = await db.collection<ResourceNotificationDbObject>(NOTIFICATIONS).deleteOne(
        {
            "resource._id": new ObjectId(resourceId),
            "user._id": userId
        }, {
        session
    })

    const result = await db.collection<ResourceDbObject>(RESOURCES).updateMany({
        _id: new ObjectId(resourceId),
        "tickets.statuses.statusCode": TicketStatusCode.AwaitingConfirmation
    }, {
        $pull: {
            "tickets.$[myTicket].statuses": { $or: [{ statusCode: TicketStatusCode.AwaitingConfirmation }, { statusCode: TicketStatusCode.Queued, queuePosition: 1 }] }
        }
    }, {
        session,
        arrayFilters: [
            {
                "myTicket.statuses.statusCode": TicketStatusCode.AwaitingConfirmation
            },
        ],
    })

    console.log("RESULT", result, result2)
}

async function notifyFirstInQueue(
    resourceId: string,
    currentDate: Date,
    executionPosition: number,
    session?: ClientSession) {
    const db = await MongoDBSingleton.getInstance().db;
    // Add 1ms to make sure the statuses are in order
    const timestamp = addMSToTime(currentDate, executionPosition)
    await db.collection(RESOURCES).updateOne({
        _id: new ObjectId(resourceId),
        "tickets.statuses.queuePosition": 1
    }, {
        $push: {
            "tickets.$[myTicket].statuses": { statusCode: TicketStatusCode.AwaitingConfirmation, timestamp, queuePosition: 1 }
        }
    }, {
        session,
        arrayFilters: [
            {
                "myTicket.statuses.queuePosition": 1
            },
        ],
    })
}


const generateOutputByResource: Record<RequestSource, (resource: ResourceDbObject, userId: ObjectId, resourceId: string) => ResourceManagementResult> = {
    HOME: ({ activeUserCount, creationDate, createdBy, lastModificationDate, name, description, tickets, maxActiveTickets }, userId, resourceId) => {
        const myTicket = tickets?.[0];
        const { statusCode, timestamp: lastStatusTimestamp, queuePosition } = getLastStatus(tickets.find(({ user }) => user._id?.equals(userId)));
        return {
            status: OperationResult.Ok,
            updatedResourceCard: {
                activeUserCount,
                creationDate,
                createdBy: { userId: createdBy?._id?.toHexString(), username: createdBy?.username ?? "" },
                lastModificationDate,
                maxActiveTickets,
                name,
                queuePosition,
                description,
                lastStatusTimestamp,
                statusCode: statusCode as TicketStatusCode,
                role: myTicket.user?.role as LocalRole,
                ticketId: myTicket._id?.toHexString(),
                resourceId
            }
        }
    },
    RESOURCE: (resource) => ({
        status: OperationResult.Ok,
        // TO BE IMPLEMENTED WHEN VIEW IS READY
        // updatedResourceView: {

        // }
    }),
}



async function pushNotification(resourceName: string, resourceId: ObjectId | null | undefined,
    createdByUserId: ObjectId | null | undefined, createdByUsername: string | undefined, timestamp: Date) {
    const db = await MongoDBSingleton.getInstance().db;
    console.log("ANTES DE PEDIR DATOS Y ESO", resourceId?.toHexString() ?? "");

    // let's notify all the WebPush links associated with the user
    const resource = await getAwaitingTicket(resourceId?.toHexString() ?? "");
    const ticket = resource?.tickets[0];
    const user = ticket?.user;

    console.log("ENTRA AL PUSH!!", resource, ticket, user, resourceId);
    // Now we insert the record
    if (user?._id == null) {
        console.log("NANAI");
        return;
    }

    const notificationData = {
        _id: new ObjectId(),
        ticketStatus: TicketStatusCode.AwaitingConfirmation,
        user: { username: user?.username ?? "", _id: user?._id },
        titleRef: "ResourceAvailableNotification",
        descriptionRef: "ResourceAvailableDescriptionNotification",
        resource: { _id: resourceId, name: resourceName, createdBy: { _id: createdByUserId, username: createdByUsername ?? "" } },
        timestamp
    };
    await db.collection<ResourceNotificationDbObject>(NOTIFICATIONS).insertOne(notificationData);

    // Finally, we obtain the destined user subscriptions
    const fullReceivingUser = await getUser(user?._id);

    console.log("FULL RECEIVING USER", fullReceivingUser);

    if (fullReceivingUser == null) {
        return;
    }

    fullReceivingUser?.webPushSubscriptions?.forEach(subscription => {
        if (subscription == null) {
            return;
        }
        console.log("PUSHEA!!!");
        sendNotification({ endpoint: subscription.endpoint ?? "", keys: { auth: subscription.keys?.auth ?? "", p256dh: subscription.keys?.p256dh ?? "" } })
    })

    RedisSingleton.getInstance().pubsub.publish(generateChannelId(RESOURCE_READY_TO_PICK, user?._id), {
        myNotificationDataSub: [
            notificationData
        ]
    })

}

export { getUserTicket, getResource, pushNewStatus, enqueue, forwardQueue, notifyFirstInQueue, generateOutputByResource, pushNotification, getAwaitingTicket, removeAwaitingConfirmation }