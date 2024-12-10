import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import {
  parseUrl,
  fetchParticipantsByURLParams,
  formatParticipants,
} from "./participants";

export const server = {
  getParticipants: defineAction({
    accept: "form",
    input: z.object({
      url: z.string().url(),
    }),
    handler: async (input) => {
      const params = parseUrl(input.url);
      const participants = await fetchParticipantsByURLParams(params);
      if (!participants.length) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "No participants other than the author was found in the pull request",
        });
      }
      return {
        participants: formatParticipants(participants),
      };
    },
  }),
};
