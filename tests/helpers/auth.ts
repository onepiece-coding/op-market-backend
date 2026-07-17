import type request from "supertest";
import {
  signAccessToken,
  signRefreshToken,
} from "../../src/utils/tokenHelper.js";
import { createAdmin, createVerifiedUser } from "./factories.js";

type Agent = ReturnType<typeof request.agent>;

export const bearerTokenFor = (userId: number) => {
  return signAccessToken(userId);
};

export const refreshTokenFor = (userId: number) => {
  return signRefreshToken(userId);
};

export const authHeaderFor = (userId: number) => {
  return `Bearer ${bearerTokenFor(userId)}`;
};

export const accessCookieHeaderFor = (userId: number) => {
  const accessToken = bearerTokenFor(userId);
  return [`accessToken=${accessToken}`];
};

export const refreshCookieHeaderFor = (userId: number) => {
  const refreshToken = refreshTokenFor(userId);
  return [`refreshToken=${refreshToken}`];
};

export const authRequest = <T extends request.Test>(req: T, userId: number) => {
  return req.set("Authorization", authHeaderFor(userId));
};

export const setAccessCookie = <T extends request.Test>(
  req: T,
  userId: number,
) => {
  return req.set("Cookie", accessCookieHeaderFor(userId));
};

export const setRefreshCookie = <T extends request.Test>(
  req: T,
  userId: number,
) => {
  return req.set("Cookie", refreshCookieHeaderFor(userId));
};

export const loginWithAgent = async (
  agent: Agent,
  email: string,
  password: string,
) => {
  return agent.post("/api/v1/auth/login").send({
    email,
    password,
  });
};

export const createAndLoginVerifiedUser = async (agent: Agent) => {
  const { user, rawPassword } = await createVerifiedUser();

  const response = await loginWithAgent(agent, user.email, rawPassword);

  return {
    user,
    rawPassword,
    response,
  };
};

export const createAndLoginAdmin = async (agent: Agent) => {
  const { user, rawPassword } = await createAdmin();

  const response = await loginWithAgent(agent, user.email, rawPassword);

  return {
    user,
    rawPassword,
    response,
  };
};
