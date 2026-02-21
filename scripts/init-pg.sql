-- Create the etl schema for dynamically-created data tables
-- This schema is managed by raw SQL (not Prisma), while Prisma manages the public schema
CREATE SCHEMA IF NOT EXISTS etl;

-- Grant usage to the default user
GRANT ALL ON SCHEMA etl TO zetta;
