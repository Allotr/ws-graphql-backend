import express from "express";
import https from "https";
import fs from "fs";
import { graphqlHTTP } from "express-graphql";
import * as core from 'express-serve-static-core';
import ws, { AddressInfo } from "ws";
import { useServer } from "graphql-ws/lib/use/ws"
import { execute, subscribe } from 'graphql';
import schema from "./graphql/schemasMap";
import { EnvLoader } from "./utils/env-loader";
import { MongoDBSingleton } from "./utils/mongodb-singleton";


require('dotenv').config();

const { IS_HTTPS, HTTPS_PORT, WS_PATH } = EnvLoader.getInstance().loadedVariables;
// Important, make proper conversion to boolean
const isHTTPS =  (IS_HTTPS === 'true');

// Initialize database connection
MongoDBSingleton.getInstance()


// EXPRESS and GraphQL HTTP initialization

const expressServer = express();
expressServer.use(graphqlHTTP({ schema, graphiql: true }));

const server = expressServer.listen(HTTPS_PORT, () => {
    console.log(`GraphQL server running using ${Boolean(isHTTPS) ? "HTTPS" : "HTTP"} on port ${HTTPS_PORT}`);

    const wsServer = new ws.Server({ server, path: WS_PATH });
    useServer({ schema, execute, subscribe }, wsServer);
});


