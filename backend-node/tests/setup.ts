import { TEST_DATABASE_URL } from "./globalSetup";

// MUST run before any src module import: dotenv.config() in src/config/env.ts
// never overrides an already-set process.env var, so pointing at a dedicated
// test database here keeps the dev database untouched.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test";