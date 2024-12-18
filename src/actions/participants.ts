import { ActionError } from "astro:actions";
import { GH_TOKEN } from "astro:env/server";
import { z } from "astro:schema";

const MAX_RESULTS_PER_PAGE = 100;
const GQL_ENDPOINT = "https://api.github.com/graphql";
const GQL_QUERY = `
  query participants($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        author {
          login
        }
        participants(first: 100) {
          totalCount
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            name
            login
            databaseId
          }
        }
      }
    }
  }
`;

const ParticipantSchema = z.object({
  name: z.string().nullable(),
  login: z.string(),
  databaseId: z.number(),
});

const GitHubParticipantsResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        author: z.object({
          login: z.string(),
        }),
        participants: z.object({
          totalCount: z.number(),
          pageInfo: z.object({
            endCursor: z.string(),
            hasNextPage: z.boolean(),
          }),
          nodes: z.array(ParticipantSchema),
        }),
      }),
    }),
  }),
});

const URLParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pr: z.coerce.number(),
});

type ParticipantsUrlParams = z.output<typeof URLParamsSchema>;
type GitHubApiResponse = z.output<typeof GitHubParticipantsResponseSchema>;
type Participant = z.output<typeof ParticipantSchema>;

async function fetchPaginatedParticipants(
  params: ParticipantsUrlParams,
  nextCursor = "",
): Promise<GitHubApiResponse> {
  const { owner, repo, pr } = params;
  const res = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GH_TOKEN}`,
    },
    body: JSON.stringify({
      query: GQL_QUERY,
      variables: {
        after: nextCursor,
        first: MAX_RESULTS_PER_PAGE,
        owner,
        repo,
        pr,
      },
    }),
  });
  if (!res.ok) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch participants from GitHub API",
    });
  }

  let json: unknown;

  try {
    json = await res.json();
  } catch (error) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to parse response from GitHub API",
    });
  }

  const parsedResponse = GitHubParticipantsResponseSchema.safeParse(json);
  if (!parsedResponse.success) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to parse response from GitHub API",
    });
  }

  return parsedResponse.data;
}

export function parseUrl(url: string): ParticipantsUrlParams {
  const inputUrl = new URL(url);

  if (inputUrl.hostname !== "github.com") {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Invalid URL, please provide a GitHub pull request URL",
    });
  }

  const [owner, repo, _, pr] = inputUrl.pathname.split("/").filter(Boolean);

  const parsedParams = URLParamsSchema.safeParse({
    owner,
    repo,
    pr,
  });

  if (!parsedParams.success) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Invalid URL, please provide a GitHub pull request URL",
    });
  }

  return parsedParams.data;
}

export async function fetchParticipantsByURLParams(
  params: ParticipantsUrlParams,
): Promise<Participant[]> {
  const allParticipants = [];
  let nextCursor = "";
  let authorUsername = "";

  while (true) {
    const paginatedParticipants = await fetchPaginatedParticipants(
      params,
      nextCursor,
    );

    const {
      totalCount,
      pageInfo,
      nodes: participants,
    } = paginatedParticipants.data.repository.pullRequest.participants;

    allParticipants.push(...participants);

    if (totalCount < MAX_RESULTS_PER_PAGE || !pageInfo.hasNextPage) {
      authorUsername =
        paginatedParticipants.data.repository.pullRequest.author.login;
      break;
    }

    nextCursor = pageInfo.endCursor;
  }

  // Exclude the author from the list of participants
  return allParticipants.filter(
    (participant) => participant.login !== authorUsername,
  );
}

function createCoauthorString(user: Participant) {
  const email = `${user.databaseId}+${user.login}@users.noreply.github.com`;
  const name = user.name ?? user.login;
  return `Co-authored-by: ${name} <${email}>`;
}

export function formatParticipants(participants: Participant[]): string[] {
  return participants.map(createCoauthorString);
}
