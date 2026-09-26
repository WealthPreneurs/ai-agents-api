// Subscription billing for the Deal Engine.
//
// Free accounts get DEAL_ENGINE_FREE_MEMOS evaluations in total; subscribers
// get DEAL_ENGINE_MONTHLY_LIMIT per billing period. Stripe Checkout handles
// sign-up, the Stripe customer portal handles cancel/update-card, and the
// Stripe webhook keeps the `billing_accounts` table in sync. Usage is
// recorded in `deal_engine_usage` (see dashboard/supabase/billing.sql).
// Both tables are written only here, with the Supabase service role key.

const express = require('express');
const StripeModule = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const ACTIVE_STATUSES = ['active', 'trialing'];

function readConfig(env = process.env) {
  return {
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    stripePriceId: env.STRIPE_PRICE_ID,
    supabaseUrl: (env.SUPABASE_URL || '').replace(/\/$/, ''),
    supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    appUrl: (env.APP_URL || '').replace(/\/$/, ''),
    freeMemos: Number(env.DEAL_ENGINE_FREE_MEMOS ?? 3),
    monthlyLimit: Number(env.DEAL_ENGINE_MONTHLY_LIMIT ?? 30),
    // Comma-separated emails that skip billing entirely (e.g. the owner).
    unlimitedEmails: (env.DEAL_ENGINE_UNLIMITED_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    disabled: env.DEAL_ENGINE_BILLING === 'off' || env.DEAL_ENGINE_AUTH === 'off',
  };
}

// Storage for billing accounts and usage, backed by Supabase.
function supabaseStore(url, serviceKey) {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = ({ data, error }) => {
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data;
  };
  return {
    async getAccount(clientId) {
      return check(await db.from('billing_accounts').select('*').eq('client_id', clientId).maybeSingle());
    },
    async getAccountByCustomer(customerId) {
      return check(
        await db.from('billing_accounts').select('*').eq('stripe_customer_id', customerId).maybeSingle()
      );
    },
    async upsertAccount(row) {
      check(await db.from('billing_accounts').upsert(row, { onConflict: 'client_id' }));
    },
    async countUsage(clientId, sinceIso) {
      let query = db
        .from('deal_engine_usage')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId);
      if (sinceIso) query = query.gte('created_at', sinceIso);
      const { count, error } = await query;
      if (error) throw new Error(`Supabase: ${error.message}`);
      return count || 0;
    },
    async addUsage(clientId) {
      check(await db.from('deal_engine_usage').insert({ client_id: clientId }));
    },
  };
}

const toIso = (unixSeconds) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null);

function isActive(account, now = Date.now()) {
  if (!account || !ACTIVE_STATUSES.includes(account.status)) return false;
  // Allow a day of grace past period end in case a renewal webhook is late.
  if (account.current_period_end) {
    return new Date(account.current_period_end).getTime() + 86400000 > now;
  }
  return true;
}

function createBilling({ config = readConfig(), store, stripe } = {}) {
  const stripeReady = Boolean(config.stripeSecretKey && config.stripePriceId);
  if (!stripe && config.stripeSecretKey) stripe = StripeModule(config.stripeSecretKey);
  if (!store && config.supabaseUrl && config.supabaseServiceKey) {
    store = supabaseStore(config.supabaseUrl, config.supabaseServiceKey);
  }

  function status() {
    if (config.disabled) return 'disabled';
    if (!store) return 'missing-supabase-service-key';
    if (!stripeReady) return 'free-only';
    if (!config.stripeWebhookSecret) return 'missing-webhook-secret';
    if (!config.appUrl) return 'missing-app-url';
    return 'configured';
  }

  let priceCache = null;
  async function planPrice() {
    if (!stripeReady) return null;
    if (priceCache) return priceCache;
    try {
      const price = await stripe.prices.retrieve(config.stripePriceId);
      priceCache = {
        amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval || 'month',
      };
    } catch (error) {
      console.log(`[BILLING] Could not load price ${config.stripePriceId}: ${error.message}`);
      return null;
    }
    return priceCache;
  }

  // What this user can do right now.
  async function entitlement(user) {
    if (config.disabled || (user.email && config.unlimitedEmails.includes(user.email.toLowerCase()))) {
      return { plan: 'unlimited', canRun: true, used: 0, limit: null };
    }
    if (!store) {
      return {
        plan: 'unknown',
        canRun: false,
        message: 'Billing is not configured on the server (SUPABASE_SERVICE_ROLE_KEY is missing).',
      };
    }

    const account = await store.getAccount(user.id);
    if (isActive(account)) {
      const since =
        account.current_period_start || new Date(Date.now() - 30 * 86400000).toISOString();
      const used = await store.countUsage(user.id, since);
      const canRun = used < config.monthlyLimit;
      return {
        plan: 'pro',
        status: account.status,
        canRun,
        used,
        limit: config.monthlyLimit,
        periodEnd: account.current_period_end,
        cancelAtPeriodEnd: account.cancel_at_period_end,
        message: canRun
          ? null
          : `You've used all ${config.monthlyLimit} memos in this billing period. Your allowance resets on ${new Date(
              account.current_period_end
            ).toLocaleDateString('en-US')}.`,
      };
    }

    const used = await store.countUsage(user.id, null);
    const canRun = used < config.freeMemos;
    return {
      plan: 'free',
      status: account?.status || 'none',
      canRun,
      used,
      limit: config.freeMemos,
      hasBillingAccount: Boolean(account?.stripe_customer_id),
      message: canRun
        ? null
        : `You've used your ${config.freeMemos} free memos. Subscribe to keep evaluating deals.`,
    };
  }

  async function recordUsage(user) {
    if (config.disabled || !store) return;
    await store.addUsage(user.id);
  }

  // Keeps billing_accounts in line with a Stripe subscription object.
  async function syncSubscription(sub) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    let clientId = sub.metadata?.client_id;
    const existing = clientId
      ? await store.getAccount(clientId)
      : await store.getAccountByCustomer(customerId);
    clientId = clientId || existing?.client_id;
    if (!clientId) {
      console.log(`[BILLING] No user found for subscription ${sub.id} (customer ${customerId})`);
      return;
    }

    // Ignore late events for an old subscription when a newer one is active.
    if (
      existing?.stripe_subscription_id &&
      existing.stripe_subscription_id !== sub.id &&
      ACTIVE_STATUSES.includes(existing.status) &&
      !ACTIVE_STATUSES.includes(sub.status)
    ) {
      return;
    }

    // Billing periods live on subscription items in current Stripe API versions.
    const item = sub.items?.data?.[0];
    await store.upsertAccount({
      client_id: clientId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_start: toIso(item?.current_period_start ?? sub.current_period_start),
      current_period_end: toIso(item?.current_period_end ?? sub.current_period_end),
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      updated_at: new Date().toISOString(),
    });
    console.log(`[BILLING] ${clientId} → ${sub.status}`);
  }

  async function handleEvent(event) {
    const object = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
        if (object.mode === 'subscription' && object.subscription) {
          const sub = await stripe.subscriptions.retrieve(object.subscription);
          if (!sub.metadata?.client_id && object.client_reference_id) {
            sub.metadata = { ...sub.metadata, client_id: object.client_reference_id };
          }
          await syncSubscription(sub);
        }
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(object);
        break;
      default:
        break;
    }
  }

  // Express handler for POST /stripe/webhook. Needs the raw request body.
  async function webhook(req, res) {
    if (!stripe || !config.stripeWebhookSecret || !store) {
      return res.status(503).json({ error: 'Billing webhook is not configured.' });
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripeWebhookSecret);
    } catch (error) {
      console.log(`[BILLING] Webhook signature check failed: ${error.message}`);
      return res.status(400).json({ error: 'Invalid signature' });
    }
    try {
      await handleEvent(event);
      res.json({ received: true });
    } catch (error) {
      // A 500 makes Stripe retry the event later.
      console.log(`[BILLING] Webhook ${event.type} failed: ${error.message}`);
      res.status(500).json({ error: 'Webhook handling failed' });
    }
  }

  // Routes that need a logged-in user (requireUser runs first).
  function router(requireUser) {
    const r = express.Router();

    r.get('/billing/status', requireUser, async (req, res) => {
      try {
        const [ent, price] = await Promise.all([entitlement(req.user), planPrice()]);
        res.json({ ...ent, price, checkoutAvailable: status() === 'configured' });
      } catch (error) {
        console.log(`[BILLING] Status failed: ${error.message}`);
        res.status(500).json({ error: 'Could not load your plan. Try again in a minute.' });
      }
    });

    r.post('/billing/checkout', requireUser, async (req, res) => {
      if (status() !== 'configured') {
        return res.status(503).json({ error: 'Subscriptions are not set up on the server yet.' });
      }
      try {
        const account = await store.getAccount(req.user.id);
        if (isActive(account)) {
          return res.status(409).json({ error: 'You already have an active subscription.' });
        }
        let customerId = account?.stripe_customer_id;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: req.user.email,
            metadata: { client_id: req.user.id },
          });
          customerId = customer.id;
          await store.upsertAccount({
            client_id: req.user.id,
            stripe_customer_id: customerId,
            status: account?.status || 'none',
            updated_at: new Date().toISOString(),
          });
        }
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          client_reference_id: req.user.id,
          line_items: [{ price: config.stripePriceId, quantity: 1 }],
          subscription_data: { metadata: { client_id: req.user.id } },
          allow_promotion_codes: true,
          success_url: `${config.appUrl}/?billing=success`,
          cancel_url: `${config.appUrl}/?billing=cancelled`,
        });
        res.json({ url: session.url });
      } catch (error) {
        console.log(`[BILLING] Checkout failed: ${error.message}`);
        res.status(500).json({ error: 'Could not start checkout. Try again in a minute.' });
      }
    });

    r.post('/billing/portal', requireUser, async (req, res) => {
      if (!stripe || !store || !config.appUrl) {
        return res.status(503).json({ error: 'Billing is not set up on the server yet.' });
      }
      try {
        const account = await store.getAccount(req.user.id);
        if (!account?.stripe_customer_id) {
          return res.status(404).json({ error: 'No billing account found. Subscribe first.' });
        }
        const session = await stripe.billingPortal.sessions.create({
          customer: account.stripe_customer_id,
          return_url: `${config.appUrl}/`,
        });
        res.json({ url: session.url });
      } catch (error) {
        console.log(`[BILLING] Portal failed: ${error.message}`);
        res.status(500).json({ error: 'Could not open billing settings. Try again in a minute.' });
      }
    });

    return r;
  }

  return { status, entitlement, recordUsage, webhook, router, handleEvent, syncSubscription };
}

module.exports = { createBilling, readConfig, isActive };
