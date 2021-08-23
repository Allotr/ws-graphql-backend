
import { Resolvers, ResultDbObject } from "allotr-graphql-schema-types";
import { MongoDBSingleton } from "../../utils/mongodb-singleton";
import { RedisSingleton } from "../../utils/redis-singleton";

export const UserResolvers: Resolvers = {
  Query: {
    results: async () => {
      const db = await MongoDBSingleton.getInstance().db;
      // Find all results
      const dbOutput = await db.collection<ResultDbObject>('results').find()

      if (dbOutput == null) {
        return [];
      }

      return dbOutput.toArray() || [];
    }
  },
  Subscription: {
    newUpdate: {
      subscribe: () => RedisSingleton.getInstance().pubsub.asyncIterator('something_changed'),
    }
  }
}