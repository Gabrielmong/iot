import { authResolvers } from "./auth.js";
import { computerResolvers } from "./computers.js";
import { tvResolvers } from "./tv.js";
import { cameraControlResolvers } from "./camera-controls.js";
import { cameraGroupResolvers } from "./camera-groups.js";
import { deployResolvers } from "./deploys.js";
import { deviceResolvers } from "./devices.js";
import { homeResolvers } from "./home.js";
import { integrationResolvers } from "./integrations.js";
import { layoutResolvers } from "./layouts.js";
import { trialResolvers } from "./trials.js";
import { roomResolvers } from "./rooms.js";
import { routineResolvers } from "./routines.js";
import { subscriptionResolvers } from "./subscriptions.js";
import { userResolvers } from "./users.js";

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...homeResolvers.Query,
    ...deviceResolvers.Query,
    ...roomResolvers.Query,
    ...userResolvers.Query,
    ...integrationResolvers.Query,
    ...layoutResolvers.Query,
    ...routineResolvers.Query,
    ...cameraGroupResolvers.Query,
    ...cameraControlResolvers.Query,
    ...deployResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...homeResolvers.Mutation,
    ...deviceResolvers.Mutation,
    ...computerResolvers.Mutation,
    ...tvResolvers.Mutation,
    ...roomResolvers.Mutation,
    ...userResolvers.Mutation,
    ...integrationResolvers.Mutation,
    ...layoutResolvers.Mutation,
    ...trialResolvers.Mutation,
    ...routineResolvers.Mutation,
    ...cameraGroupResolvers.Mutation,
    ...cameraControlResolvers.Mutation,
    ...deployResolvers.Mutation,
  },
  ...subscriptionResolvers,
};
