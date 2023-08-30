
import { Resolvers } from "allotr-graphql-schema-types";
import { getRedisConnection } from "../../utils/redis-connector";
import { generateChannelId } from "../../utils/data-util";
import { withFilter } from 'graphql-subscriptions';
import { RESOURCE_READY_TO_PICK } from "../../consts/connection-tokens";
import { getTargetUserId } from "../../guards/guards";


export const NotificationResolvers: Resolvers = {
    Subscription: {
        myNotificationDataSub: {
            subscribe: withFilter(
                (parent, args, context) => {
                    if (!context.user) {
                        throw new Error('You need to be logged in');
                    }

                    const { userId: targetUserId } = args;
                    const userId = getTargetUserId(context.user, targetUserId);
                    // context.user._id
                    return getRedisConnection().pubsub.asyncIterator(generateChannelId(RESOURCE_READY_TO_PICK, userId))
                }, (payload, variables, context) => {
                    return true;
                })
        }
    }
}