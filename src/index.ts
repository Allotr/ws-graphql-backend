import express from "express";
import { graphqlHTTP, OptionsData } from "express-graphql";
import ws from "ws";
import { useServer } from "graphql-ws/lib/use/ws"
import { execute, subscribe } from 'graphql';
import schema from "./graphql/schemasMap";
import { EnvLoader } from "./utils/env-loader";
import { MongoDBSingleton } from "./utils/mongodb-singleton";
import { initializeGooglePassport, isLoggedIn } from "./auth/google-passport";

// This NEEDS to be executed first
require('dotenv').config();
// Initialize database connection
MongoDBSingleton.getInstance()

const app = express();


initializeGooglePassport(app);

const { IS_HTTPS, HTTPS_PORT, WS_PATH } = EnvLoader.getInstance().loadedVariables;

// Important, make proper conversion to boolean
const isHTTPS = (IS_HTTPS === 'true');

// Initialize database connection
MongoDBSingleton.getInstance()


// GraphQL initialization
app.use("/graphql", isLoggedIn, graphqlHTTP(req => ({ schema, graphiql: true, context: req })));


const server = app.listen(HTTPS_PORT, () => {
    console.log(`GraphQL server running using ${Boolean(isHTTPS) ? "HTTPS" : "HTTP"} on port ${HTTPS_PORT}`);

    const wsServer = new ws.Server({ server, path: WS_PATH });
    useServer({ schema, execute, subscribe }, wsServer);
});


