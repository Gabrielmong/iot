import { badInput } from "../api-errors.js";
import { Prisma } from "../generated/prisma/client.js";

/** Runs a write whose only unique constraint is a name, turning a duplicate into BAD_USER_INPUT. */
export async function uniqueName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw badInput("That name is already taken");
    throw err;
  }
}
