-- Extend activity stream types for precise running NGP calculation

ALTER TYPE activity_stream_type ADD VALUE IF NOT EXISTS 'distance';
ALTER TYPE activity_stream_type ADD VALUE IF NOT EXISTS 'altitude';
