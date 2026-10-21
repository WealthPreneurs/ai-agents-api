#!/usr/bin/env node
// Validates Kingdom Quest content: the curriculum map, the catalog, and every
// daily node in content/days. Checks the rules a JSON Schema can't express on
// its own (realm/region math, ids that must exist in the catalog, verse tokens
// that must rebuild the verse). Exits non-zero on any error. No dependencies.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const schema = readJson(path.join(ROOT, 'schema/daily-node.schema.json'));
const curriculum = readJson(path.join(ROOT, 'content/curriculum.json'));
const catalog = readJson(path.join(ROOT, 'content/catalog.json'));

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function inRange(n, [lo, hi]) {
  return n >= lo && n <= hi;
}

// Curriculum: 52 contiguous realms, regions and phases tile 1..52 exactly.
function checkTiling(where, ranges) {
  let next = 1;
  for (const r of ranges) {
    if (r[0] !== next) fail(where, `expected a range starting at realm ${next}, got ${r[0]}`);
    if (r[1] < r[0]) fail(where, `range ${r[0]}-${r[1]} is backwards`);
    next = r[1] + 1;
  }
  if (next !== 53) fail(where, `ranges end at realm ${next - 1}, expected 52`);
}

checkTiling('curriculum.regions', curriculum.regions.map((r) => r.realms));
checkTiling('curriculum.identity_phases', curriculum.identity_phases.map((p) => p.realms));

const companionIds = new Set(catalog.companions.map((c) => c.id));
const badgeIds = new Set(catalog.identity_badges.map((b) => b.id));
const traitIds = new Set(catalog.traits.map((t) => t.id));
const materialIds = new Set(catalog.materials);

for (const region of curriculum.regions) {
  if (!companionIds.has(region.companion)) fail(`region ${region.region}`, `unknown companion "${region.companion}"`);
}
for (const trait of catalog.traits) {
  if (!badgeIds.has(trait.badge)) fail(`trait ${trait.id}`, `unknown badge "${trait.badge}"`);
}

curriculum.realms.forEach((realm, i) => {
  if (realm.realm !== i + 1) fail(`curriculum.realms[${i}]`, `expected realm ${i + 1}, got ${realm.realm}`);
  const phase = curriculum.identity_phases.find((p) => inRange(realm.realm, p.realms));
  if (!phase || phase.id !== realm.phase) {
    fail(`realm ${realm.realm}`, `phase "${realm.phase}" should be "${phase && phase.id}"`);
  }
});
if (curriculum.realms.length !== 52) fail('curriculum.realms', `has ${curriculum.realms.length} realms, expected 52`);

// Daily nodes.
const realmOfDay = (day) => Math.min(52, Math.ceil(day / 7));
const regionOfRealm = (realm) => curriculum.regions.find((r) => inRange(realm, r.realms)).region;
const passagePattern = new RegExp(schema.properties.scripture_passage.pattern);
const truthPattern = new RegExp(schema.properties.identity_focus.properties.core_truth.pattern);
const required = schema.required;
const allowed = new Set(Object.keys(schema.properties));

const daysDir = path.join(ROOT, 'content/days');
const files = fs.readdirSync(daysDir).filter((f) => f.endsWith('.json')).sort();
const seenDays = new Set();

for (const file of files) {
  const where = `days/${file}`;
  let node;
  try {
    node = readJson(path.join(daysDir, file));
  } catch (err) {
    fail(where, `invalid JSON (${err.message})`);
    continue;
  }

  for (const key of required) if (!(key in node)) fail(where, `missing "${key}"`);
  for (const key of Object.keys(node)) if (!allowed.has(key)) fail(where, `unexpected field "${key}"`);
  if (!Number.isInteger(node.day) || node.day < 1 || node.day > 365) {
    fail(where, 'day must be an integer from 1 to 365');
    continue;
  }

  const expectedName = `day-${String(node.day).padStart(3, '0')}.json`;
  if (file !== expectedName) fail(where, `file should be named ${expectedName}`);
  if (seenDays.has(node.day)) fail(where, `duplicate day ${node.day}`);
  seenDays.add(node.day);

  const realm = realmOfDay(node.day);
  if (node.realm !== realm) fail(where, `realm should be ${realm}`);
  if (node.month !== regionOfRealm(realm)) fail(where, `month (region) should be ${regionOfRealm(realm)}`);
  const realmInfo = curriculum.realms[realm - 1];
  if (node.identity_phase !== realmInfo.phase) fail(where, `identity_phase should be "${realmInfo.phase}"`);
  if (node.is_sabbath_camp !== (node.day % 7 === 0)) fail(where, `is_sabbath_camp should be ${node.day % 7 === 0}`);
  // Sabbath Camp hosts the realm's Identity Milestone and replays its anchor verse.
  if (node.day % 7 === 0) {
    if ((node.identity_focus || {}).core_truth !== realmInfo.milestone) fail(where, `Sabbath Camp core_truth should be the realm milestone "${realmInfo.milestone}"`);
    if ((node.memory_verse || {}).reference !== realmInfo.anchor_verse) fail(where, `Sabbath Camp memory_verse should be the realm anchor verse ${realmInfo.anchor_verse}`);
  }
  if (!passagePattern.test(node.scripture_passage || '')) fail(where, `scripture_passage "${node.scripture_passage}" is not a reference`);

  const tooLong = (field, value, max) => {
    if (typeof value === 'string' && value.length > max) fail(where, `${field} is ${value.length} characters (max ${max})`);
  };
  tooLong('theme', node.theme, schema.properties.theme.maxLength);
  tooLong('story_title', node.story_title, schema.properties.story_title.maxLength);
  tooLong('summary', node.summary, schema.properties.summary.maxLength);
  tooLong('micro_prayer.text', node.micro_prayer && node.micro_prayer.text, schema.properties.micro_prayer.properties.text.maxLength);
  tooLong('companion.message', node.companion && node.companion.message, schema.properties.companion.properties.message.maxLength);

  const reel = node.story_reel || {};
  for (const [i, scene] of (reel.scenes || []).entries()) {
    tooLong(`story_reel.scenes[${i}].caption`, scene.caption, schema.properties.story_reel.properties.scenes.items.properties.caption.maxLength);
  }
  if (!(reel.duration_seconds >= 60 && reel.duration_seconds <= 150)) fail(where, 'story_reel.duration_seconds must be 60-150');
  if (!Array.isArray(reel.scenes) || reel.scenes.length < 3) fail(where, 'story_reel needs at least 3 scenes');

  const verse = node.memory_verse || {};
  if (!Array.isArray(verse.tokens) || verse.tokens.join(' ') !== verse.text) {
    fail(where, 'memory_verse.tokens joined with spaces must equal memory_verse.text');
  }
  for (const d of verse.distractors || []) {
    if ((verse.tokens || []).includes(d)) fail(where, `distractor "${d}" is also a real token`);
  }

  const identity = node.identity_focus || {};
  if (!truthPattern.test(identity.core_truth || '')) fail(where, 'identity_focus.core_truth should start with Yahweh, I, Jesus, My, or When');
  if (!traitIds.has(identity.trait_unlocked)) fail(where, `unknown trait "${identity.trait_unlocked}"`);

  if (!Array.isArray(node.quiz) || node.quiz.length !== 3) {
    fail(where, 'quiz must have exactly 3 questions');
  } else {
    node.quiz.forEach((q, i) => {
      const opts = q.options || [];
      if (opts.length < 3 || opts.length > 4) fail(where, `quiz[${i}] needs 3-4 options`);
      if (new Set(opts).size !== opts.length) fail(where, `quiz[${i}] has duplicate options`);
      if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index >= opts.length) {
        fail(where, `quiz[${i}].correct_index is out of range`);
      }
      if (!q.explanation) fail(where, `quiz[${i}] needs an explanation`);
    });
  }

  const companionId = node.companion && node.companion.id;
  if (!companionIds.has(companionId)) fail(where, `unknown companion "${companionId}"`);
  else if (companionId !== curriculum.regions[regionOfRealm(realm) - 1].companion) {
    fail(where, `companion should be the region's guide "${curriculum.regions[regionOfRealm(realm) - 1].companion}"`);
  }
  const rewards = node.rewards || {};
  if (!Number.isInteger(rewards.light_stones) || rewards.light_stones < 0) fail(where, 'rewards.light_stones must be a non-negative integer');
  for (const m of rewards.materials || []) if (!materialIds.has(m)) fail(where, `unknown material "${m}"`);
  if (node.review && node.review.status === 'published' && !(node.review.reviewers || []).length) {
    fail(where, 'published nodes need at least one theology reviewer');
  }
}

if (errors.length) {
  console.error(`Kingdom Quest content: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Kingdom Quest content OK: 52 realms, 12 regions, ${files.length} daily node(s), ${catalog.identity_badges.length} badges.`);
