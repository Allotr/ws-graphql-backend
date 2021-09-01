import { Resolvers, TicketStatusCode, UserDbObject } from "allotr-graphql-schema-types";
import { MongoDBSingleton } from "../../utils/mongodb-singleton";
import { RedisSingleton } from "../../utils/redis-singleton";
import { ObjectId } from "mongodb"
import { generateChannelId } from "../../utils/data-util";
import { RESOURCE_READY_TO_PICK } from "../../consts/connection-tokens";
import { USERS } from "../../consts/collections";

export const NotificationResolvers: Resolvers = {
    Query: {
        myNotificationData: async (parent, args, context) => {
            // Implement something real here, please
            console.log("Entra!");
            return [{
                ticketStatus: TicketStatusCode.AwaitingConfirmation,
                user: { username: "mysterysynthman", userId: new ObjectId().toHexString() },
                descriptionRef: "ResourceAvailableDescriptionNotification",
                titleRef: "ResourceAvailableNotification",
                id: new ObjectId().toHexString(),
                resource: { createdBy: { username: "rafaelpernil", userId: new ObjectId().toHexString() }, name: "Pepe", id: new ObjectId().toHexString() },
                timestamp: new Date()
            }];
        }
    }
}