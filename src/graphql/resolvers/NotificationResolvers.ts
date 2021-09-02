
import { Resolvers, OperationResult, ResourceDbObject, UserDbObject, LocalRole, TicketStatusCode, ErrorCode, User, ResourceCard, Ticket, RequestSource, ResourceManagementResult, WebPushSubscription, ResourceNotification, ResourceNotificationDbObject } from "allotr-graphql-schema-types";
import { MongoDBSingleton } from "../../utils/mongodb-singleton";
import { RedisSingleton } from "../../utils/redis-singleton";
import { ObjectId, ReadPreference, WriteConcern, ReadConcern, TransactionOptions, ClientSession, Db } from "mongodb"
import { compareDates, customTryCatch, generateChannelId, getLastQueuePosition, getLastStatus } from "../../utils/data-util";
import { CustomTryCatch } from "../../types/custom-try-catch";
import { withFilter } from 'graphql-subscriptions';
import { RESOURCE_CREATED, RESOURCE_READY_TO_PICK } from "../../consts/connection-tokens";
import { canRequestStatusChange } from "../../guards/guards";
import { enqueue, forwardQueue, generateOutputByResource, getResource, pushNotification, notifyFirstInQueue, pushNewStatus, getAwaitingTicket, removeAwaitingConfirmation } from "../../utils/resolver-utils";
import { NOTIFICATIONS, RESOURCES, USERS } from "../../consts/collections";
import { EnvLoader } from "../../utils/env-loader";
import { RedisPubSub } from "graphql-redis-subscriptions";

export const NotificationResolvers: Resolvers = {
    Query: {
        myNotificationData: async (parent, args, context) => {
            // Implement something real here, please
            console.log("Entra!");

            const db = await MongoDBSingleton.getInstance().db;

            const userNotifications = await db.collection<ResourceNotificationDbObject>(NOTIFICATIONS).find({
                "user._id": context.user._id
            }).toArray();

            console.log("USER NOTIFICATIONS", userNotifications)

            return userNotifications.map<ResourceNotification>(({ ticketStatus, user, _id, descriptionRef, resource, timestamp, titleRef }) => ({
                ticketStatus: ticketStatus as TicketStatusCode,
                user: { username: user.username, id: user._id as any },
                descriptionRef,
                id: _id?.toHexString(),
                resource: {
                    id: resource?._id as any, name: resource?.name ?? "", createdBy: {
                        username: resource?.createdBy?.username ?? "",
                        id: resource?.createdBy?._id as any
                    }
                },
                timestamp,
                titleRef
            }));
        }
    },
    Subscription: {
        myNotificationDataSub: {
            subscribe: withFilter(
                (parent, args, context) => {
                    if (!context.user) {
                        console.log("Peta notificación")
                        throw new Error('You need to be logged in');
                    }
                    // context.user._id
                    return RedisSingleton.getInstance().pubsub.asyncIterator(generateChannelId(RESOURCE_READY_TO_PICK, context.user._id))
                }, (payload, variables, context) => {
                    console.log("SUSCRIPCIOÖN BUENARDA; EL VALORAZO BUENO", payload);
                    return true;
                })
        }
    }
}