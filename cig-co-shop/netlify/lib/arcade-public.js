// Prize codes are emailed, never returned to the browser (CIG, Oct 29), unless
// the ARCADE_SHOW_CODE_ON_SCREEN=true kill switch is set (e.g. email is down).
function showCodeOnScreen(environment) {
  return String(environment.ARCADE_SHOW_CODE_ON_SCREEN || "").toLowerCase() === "true";
}

const EMAILED_DETAIL =
  "We just emailed your one-time code. Check your inbox (and spam or promotions). " +
  "It works once, only with the email that won it, and expires in 7 days.";

function publicPrize(prize, environment) {
  if (!prize || typeof prize !== "object") return prize || null;
  if (showCodeOnScreen(environment)) return prize;
  const { code, ...rest } = prize;
  if (!code) return rest;
  // The database's prize detail spells the code out ("Use code CIG10-... at
  // checkout"), so replace it, and scrub the code from anything else.
  const scrubbed = {};
  for (const [key, value] of Object.entries(rest)) {
    scrubbed[key] = typeof value === "string" ? value.split(code).join("your code") : value;
  }
  return {
    ...scrubbed,
    detail: EMAILED_DETAIL,
    emailed: true,
  };
}

function publicLastPlay(lastPlay, environment) {
  if (!lastPlay || typeof lastPlay !== "object") return lastPlay || null;
  return { ...lastPlay, prize: publicPrize(lastPlay.prize, environment) };
}

module.exports = { EMAILED_DETAIL, publicLastPlay, publicPrize, showCodeOnScreen };
