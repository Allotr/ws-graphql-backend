// This NEEDS to be executed first
require('dotenv').config();

import express from "express";
import ws from "ws";
import { useServer } from "graphql-ws/lib/use/ws"
import { execute, subscribe } from 'graphql';
import schema from "./graphql/schemasMap";
import { getLoadedEnvVariables } from "./utils/env-loader";
import { initializeGooglePassport, passportMiddleware, passportSessionMiddleware, sessionMiddleware } from "./auth/google-passport";
import { createOnConnect } from "graphql-passport";
import { connectionMiddleware } from "./utils/connection-utils";


const app = express();

initializeGooglePassport(app);

const { HTTPS_PORT, WS_PATH } = getLoadedEnvVariables();


const server = app.listen(HTTPS_PORT, () => {
    console.log(`GraphQL websocket server running using on port ${HTTPS_PORT}`);
    const wsServer = new ws.Server({ server, path: WS_PATH });
    // GraphQL initialization
    useServer({
        schema,
        execute,
        subscribe,
        context: async (ctx) => {
            // Send user auth as context
            const { req } = await (createOnConnect([
                connectionMiddleware,
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