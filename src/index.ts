import express from "express";
import { graphqlHTTP, OptionsData } from "express-graphql";
import ws from "ws";
import { useServer } from "graphql-ws/lib/use/ws"
import { execute, subscribe } from 'graphql';
import schema from "./graphql/schemasMap";
import { EnvLoader } from "./utils/env-loader";
import { MongoDBSingleton } from "./utils/mongodb-singleton";
import { initializeGooglePassport, isLoggedIn, passportMiddleware, passportSessionMiddleware, sessionMiddleware } from "./auth/google-passport";
import { createOnConnect } from "graphql-passport";
import { RedisSingleton } from "./utils/redis-singleton";
import { ObjectId } from "mongodb";
import { initializeWebPush } from "./notifications/web-push";

// This NEEDS to be executed first
require('dotenv').config();
// Initialize database connection
MongoDBSingleton.getInstance()

const app = express();


initializeGooglePassport(app);
initializeWebPush(app);

const { IS_HTTPS, HTTPS_PORT, WS_PATH } = EnvLoader.getInstance().loadedVariables;

// Important, make proper conversion to boolean
const isHTTPS = (IS_HTTPS === 'true');

// Initialize database connection
MongoDBSingleton.getInstance()

// GraphQL initialization
app.use("/graphql", isLoggedIn, graphqlHTTP(req => ({
    schema,
    graphiql: true,
    context: req
})));


const server = app.listen(HTTPS_PORT, () => {
    console.log(`GraphQL server running using ${Boolean(isHTTPS) ? "HTTPS" : "HTTP"} on port ${HTTPS_PORT}`);

    const wsServer = new ws.Server({ server, path: WS_PATH });
    useServer({
        schema,
        execute,
        subscribe,
        context: async (ctx) => {
            // Send user auth as context
            const { req } = await (createOnConnect([
                sessionMiddleware,
                passportMiddleware,
                passportSessionMiddleware
            ])(ctx.connectionParams ?? {}, ctx.extra.socket as any));
            return req;
        }, // or static context by supplying the value direcly
        onConnect: (ctx) => {
            // Save the upgradeReq inside the Web Socket
            (ctx.extra.socket as any).upgradeReq = ctx.extra.request;
        }
    }, wsServer);
});