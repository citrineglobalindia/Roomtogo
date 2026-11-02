// Test environment: isolated database, demo adapters, no real providers.
process.env.APP_ENV = "test";
process.env.DEMO_MODE = "true";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://room2go:room2go@localhost:5432/room2go_test";
process.env.PAYMENT_PROVIDER = "demo";
process.env.EMAIL_PROVIDER = "demo";
process.env.APP_SECRET = "test-app-secret-0123456789abcdefghijklmnopqrstuvwxyz";
process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-0123456789abcdefghijklmnop";
process.env.PUBLIC_BASE_URL = "http://localhost:3000";
