/** Community topics (must match the forum_posts.topic check constraint). */
export const TOPICS = [
  { value: "general", label: "General", description: "Anything about campus life" },
  { value: "academics", label: "Academics", description: "Courses, exams, notes and projects" },
  { value: "hostel-life", label: "Hostel life", description: "Rooms, mess, laundry and hostel tips" },
  { value: "events", label: "Events", description: "Fests, clubs, workshops and meetups" },
  { value: "lost-and-found", label: "Lost & found", description: "Lost something? Found something?" },
  { value: "advice", label: "Advice", description: "Ask seniors and peers for help" },
  { value: "marketplace-tips", label: "Marketplace tips", description: "Fair prices, safe exchanges, wanted posts" },
  { value: "off-topic", label: "Off-topic", description: "Fun, memes and everything else" },
] as const;

export type Topic = (typeof TOPICS)[number]["value"];
export const TOPIC_VALUES = TOPICS.map((t) => t.value) as [Topic, ...Topic[]];
export const TOPIC_LABELS = Object.fromEntries(TOPICS.map((t) => [t.value, t.label])) as Record<Topic, string>;

export const FEED_SORTS = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
] as const;
export type FeedSort = (typeof FEED_SORTS)[number]["value"];

export const MAX_POST_TITLE = 150;
export const MAX_POST_BODY = 10000;
export const MAX_COMMENT_BODY = 5000;
export const MAX_DEPTH = 8;
export const FEED_PAGE_SIZE = 20;

export function isTopic(value: unknown): value is Topic {
  return typeof value === "string" && (TOPIC_VALUES as readonly string[]).includes(value);
}
