-- Performance Indexes Migration
-- Created: 2024-12-31
-- Purpose: Add critical indexes for query optimization

-- ==================== SUBSCRIPTION INDEXES ====================

-- Index for finding user's subscriptions by status
CREATE INDEX IF NOT EXISTS "Subscription_userId_status_idx"
ON "Subscription"("userId", "status");

-- Index for finding creator's subscribers by status
CREATE INDEX IF NOT EXISTS "Subscription_creatorId_status_idx"
ON "Subscription"("creatorId", "status");

-- Index for filtering all subscriptions by status
CREATE INDEX IF NOT EXISTS "Subscription_status_idx"
ON "Subscription"("status");

-- ==================== POST INDEXES ====================

-- Index for fetching posts by creator, ordered by newest first (critical for feed)
CREATE INDEX IF NOT EXISTS "Post_creatorId_createdAt_idx"
ON "Post"("creatorId", "createdAt" DESC);

-- Index for filtering posts by creator and visibility
CREATE INDEX IF NOT EXISTS "Post_creatorId_visibility_idx"
ON "Post"("creatorId", "visibility");

-- ==================== POST LIKE INDEXES ====================

-- Index for finding all likes for a specific post
CREATE INDEX IF NOT EXISTS "PostLike_postId_idx"
ON "PostLike"("postId");

-- Index for finding all posts a user has liked
CREATE INDEX IF NOT EXISTS "PostLike_userId_idx"
ON "PostLike"("userId");

-- Index for sorting likes by date
CREATE INDEX IF NOT EXISTS "PostLike_createdAt_idx"
ON "PostLike"("createdAt");

-- ==================== POST COMMENT INDEXES ====================

-- Index for finding all comments for a specific post
CREATE INDEX IF NOT EXISTS "PostComment_postId_idx"
ON "PostComment"("postId");

-- Index for finding all comments by a specific user
CREATE INDEX IF NOT EXISTS "PostComment_userId_idx"
ON "PostComment"("userId");

-- Index for sorting comments by date
CREATE INDEX IF NOT EXISTS "PostComment_createdAt_idx"
ON "PostComment"("createdAt");

-- Index for filtering out deleted comments
CREATE INDEX IF NOT EXISTS "PostComment_deletedAt_idx"
ON "PostComment"("deletedAt");

-- ==================== VERIFICATION ====================

-- Check that all indexes were created successfully
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND (
    indexname LIKE 'Subscription_%_idx'
    OR indexname LIKE 'Post_%_idx'
    OR indexname LIKE 'PostLike_%_idx'
    OR indexname LIKE 'PostComment_%_idx'
)
ORDER BY tablename, indexname;

-- Performance impact summary
SELECT
    'Indexes created successfully!' as status,
    COUNT(*) as total_indexes
FROM pg_indexes
WHERE schemaname = 'public'
AND (
    indexname LIKE 'Subscription_%_idx'
    OR indexname LIKE 'Post_%_idx'
    OR indexname LIKE 'PostLike_%_idx'
    OR indexname LIKE 'PostComment_%_idx'
);
