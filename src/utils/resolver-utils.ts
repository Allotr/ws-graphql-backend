import { Resolvers, OperationResult, ResourceDbObject, UserDbObject, LocalRole, TicketStatusCode, ErrorCode, User, ResourceCard, Ticket, RequestSource, ResourceManagementResult } from "allotr-graphql-schema-types";
import { MongoDBSingleton } from "./mongodb-singleton";
import { ObjectId, ClientSession, Db } from "mongodb";
import { addMSToTime, getLastQueuePosition, getLastStatus } from "./data-util";
import { RESOURCES } from "../consts/collections";
async function getUserTicket(userId: string | ObjectId, resourceId: string, myDb?: Db): Promise<ResourceDbObject | null> {
    const db = myDb ?? await MongoDBSingleton.getInstance().db;
    const [parsedUserId, parsedResourceId] = [new ObjectId(userId), new ObjectId(resourceId)];

    const [userTikcet] = await db.collection<ResourceDbObject>("resources").find({
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

async function getResource(resourceId: string, myDb?: Db): Promise<ResourceDbObject | null> {
    const db = myDb ?? await MongoDBSingleton.getInstance().db;

    const userTikcet = await db.collection<ResourceDbObject>("resources").findOne({
        _id: new ObjectId(resourceId),
        "tickets.statuses.statusCode": {
            $ne: TicketStatusCode.Revoked
        }
    });

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
    myDb?: Db) {
    if (statusCode === TicketStatusCode.AwaitingConfirmation) {
        return "Please use popFromQueue instead";
    }
    if (statusCode === TicketStatusCode.Queued) {
        return "Please use pushToQueue instead";
    }


    const db = myDb ?? await MongoDBSingleton.getInstance().db;
    // Add 1ms to make sure the statuses are in order
    const newTimestamp = addMSToTime(timestamp, executionPosition)

    const increment: Record<TicketStatusCode, number> = {
        ACTIVE: 1,
        INACTIVE: -1,
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

async function notifyFirstInQueue(
    resourceId: string,
    currentDate: Date,
    executionPosition: number,
    session: ClientSession,
    myDb?: Db) {
    const db = myDb ?? await MongoDBSingleton.getInstance().db;
    // Add 1ms to make sure the statuses are in order
    const timestamp = addMSToTime(currentDate, executionPosition)
    await db.collection(RESOURCES).updateOne({
        _id: new ObjectId(resourceId),
        "tickets.statuses.queuePosition": 0
    }, {
        $push: {
            "tickets.$[myTicket].statuses": { statusCode: TicketStatusCode.AwaitingConfirmation, timestamp, queuePosition: null }
        }
    }, {
        session,
        arrayFilters: [
            {
                "myTicket.statuses.queuePosition": 0
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

export { getUserTicket, getResource, pushNewStatus, enqueue, forwardQueue, notifyFirstInQueue, generateOutputByResource }