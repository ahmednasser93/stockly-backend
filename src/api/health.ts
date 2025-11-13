import { json } from "../util";

export const healthCheck = async (): Promise<Response> => {
    return json({ status: "ok" });
}