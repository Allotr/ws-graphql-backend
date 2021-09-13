
import { Resolvers } from "allotr-graphql-schema-types";
import { RedisSingleton } from "../../utils/redis-singleton";
import { generateChannelId } from "../../utils/data-util";
import { withFilter } from 'graphql-subscriptions';
import {  RESOURCE_READY_TO_PICK } from "../../consts/connection-tokens";


export const NotificationResolvers: Resolvers = {
    Subscription: {
        myNotificationDataSub: {
            subscribe: withFilter(
                (parent, args, context) => {
                    if (!context.user) {
                        throw new Error('You need to be logged in');
                    }
                    // context.user._id
                    return RedisSingleton.getInstance().pubsub.asyncIterator(generateChannelId(RESOURCE_READY_TO_PICK, context.user._id))
                }, (payload, variables, context) => {
                    return true;
                })
        }
    }
}