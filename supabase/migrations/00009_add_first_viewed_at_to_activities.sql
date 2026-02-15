-- Add first_viewed_at column to activities table to track when user first views a completed activity
ALTER TABLE activities ADD COLUMN first_viewed_at timestamptz;

-- Create index for performance on first_viewed_at lookups
CREATE INDEX idx_activities_first_viewed_at ON activities(first_viewed_at) WHERE first_viewed_at IS NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN activities.first_viewed_at IS 'Timestamp when the user first viewed this activity detail page. Used to trigger RPE/comment modal on first visit.';
