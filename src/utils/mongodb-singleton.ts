import { Db, MongoClient } from "mongodb";
import { EnvLoader } from "./env-loader";

export class MongoDBSingleton {

    private static instance: MongoDBSingleton;
    private internalConnection: Promise<MongoClient | null>;
    private internalDB: Promise<Db | void>;
    public connection: Promise<MongoClient>;
    public db: Promise<Db>;

    private async checkConnectionAndReconnect() {
        if ((await this.internalConnection) != null) {
            return;
        }
        console.log("Reconnecting... Hopefully it works now");
        MongoDBSingleton.instance = new MongoDBSingleton()
    }

    public static getInstance() {
        if (!MongoDBSingleton.instance) {
            MongoDBSingleton.instance = new MongoDBSingleton()
        }
        MongoDBSingleton.instance.checkConnectionAndReconnect();
        return MongoDBSingleton.instance;
    }

    private constructor() {
        const { MONGO_DB_ENDPOINT, DB_NAME } = EnvLoader.getInstance().loadedVariables;
        const client = new MongoClient(MONGO_DB_ENDPOINT);
        const dbConnection = client.connect().catch(reason=> console.log("error in init connect", reason))  as Promise<MongoClient>;
        this.internalConnection = dbConnection;
        this.internalDB = dbConnection.then(connection => connection?.db(DB_NAME), error => {
            console.log("error in connection", error);
            this.internalConnection = Promise.resolve(null);
            client.close()
        })
        this.connection = this.internalConnection as Promise<MongoClient>;
        this.db = this.internalDB as Promise<Db>
    }
}