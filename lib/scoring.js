function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// b: {
//   reviewCount, photoCount, descriptionLength, hasMenu, hasServicesList,
//   hasAttributes, hasSchema, website, mobileFriendly, aiQueries: [{mentioned}]
// }

function computeGbpScore(b) {
  let s = 0;
  s += b.reviewCount > 0 ? 15 : 0;
  s += Math.min(20, (b.photoCount / 10) * 20);
  s += Math.min(20, (b.descriptionLength / 200) * 20);
  s += (b.hasMenu ? 10 : 0) + (b.hasServicesList ? 10 : 0);
  s += b.hasAttributes ? 15 : 0;
  s += b.rating >= 4.5 ? 20 : b.rating >= 4 ? 14 : b.rating >= 3 ? 7 : 0;
  return clamp(s);
}

function computeAiScore(b) {
  const mentioned = b.aiQueries.filter(q => q.mentioned).length;
  const mentionRate = b.aiQueries.length ? mentioned / b.aiQueries.length : 0;
  let s = mentionRate * 50;
  s += b.hasSchema ? 25 : 0;
  s += b.reviewCount >= 50 ? 15 : (b.reviewCount >= 15 ? 8 : 0);
  s += b.website ? 10 : 0;
  return clamp(s);
}

function computeWebsiteScore(b) {
  if (!b.website) return 5;
  if (!b.websiteReachable) return 10;
  let s = 0;
  s += b.hasSchema ? 40 : 0;
  s += b.mobileFriendly ? 30 : 0;
  s += b.isHttps ? 10 : 0;
  s += b.hasServicesList ? 20 : 0;
  return clamp(s);
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function computeScores(b) {
  const gbp = computeGbpScore(b);
  const ai = computeAiScore(b);
  const website = computeWebsiteScore(b);
  const overall = clamp(gbp * 0.35 + ai * 0.35 + website * 0.3);
  return { gbp, ai, website, overall, grade: gradeFor(overall) };
}

function getRecommendations(b) {
  const recs = [];
  if (b.photoCount < 10) {
    recs.push({ priority: 'High', subscore: 'GBP', text: `Add more photos to your Google Business Profile — we only found ${b.photoCount}, and listings with 10+ photos get far more profile views.` });
  }
  if (b.descriptionLength < 200) {
    recs.push({ priority: 'Medium', subscore: 'GBP', text: `Write a complete business description (150–750 characters) — yours is ${b.descriptionLength === 0 ? 'missing' : 'too short'}.` });
  }
  if (!b.hasServicesList) {
    recs.push({ priority: 'Medium', subscore: 'GBP', text: 'Add a services/menu list to your profile and website — we could not detect one.' });
  }
  if (!b.hasAttributes) {
    recs.push({ priority: 'Low', subscore: 'GBP', text: 'Fill in business attributes (accessibility, payment options) on your Google Business Profile.' });
  }
  if (!b.website) {
    recs.push({ priority: 'High', subscore: 'Website', text: 'You have no website on file — this is the single biggest gap in your AI visibility.' });
  } else if (!b.websiteReachable) {
    recs.push({ priority: 'High', subscore: 'Website', text: 'Your website did not load when we checked it — verify it is live and accessible.' });
  } else {
    if (!b.hasSchema) {
      recs.push({ priority: 'High', subscore: 'Website', text: 'Add LocalBusiness and FAQ schema markup to your homepage — AI engines rely on this to summarize you correctly.' });
    }
    if (!b.mobileFriendly) {
      recs.push({ priority: 'Medium', subscore: 'Website', text: 'Fix mobile usability issues on your website — no responsive viewport tag was detected.' });
    }
    if (!b.isHttps) {
      recs.push({ priority: 'Medium', subscore: 'Website', text: 'Serve your website over HTTPS.' });
    }
  }
  (b.aiQueries || []).forEach(q => {
    if (!q.mentioned) {
      recs.push({ priority: 'High', subscore: 'AI Visibility', text: `You were not mentioned when we asked an AI engine "${q.query}" — competitors may be winning this query.` });
    }
  });
  if (b.reviewCount < 15) {
    recs.push({ priority: 'Medium', subscore: 'AI Visibility', text: 'Get more reviews — under 15 reviews makes it hard for AI engines to trust your profile.' });
  }
  const order = { High: 0, Medium: 1, Low: 2 };
  return recs.sort((a, c) => order[a.priority] - order[c.priority]);
}

module.exports = { computeScores, getRecommendations, gradeFor, clamp };
