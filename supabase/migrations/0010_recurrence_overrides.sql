-- Add recurrence override support to tasks table

-- 1. exdates stores a list of dates (YYYY-MM-DD) that should be skipped by the master recurring rule.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS exdates JSONB DEFAULT '[]'::jsonb;

-- 2. parent_id links an "exception" task to its master recurring task.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- 3. Index for performance when querying detached exception tasks.
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

-- 4. Comment for clarity
COMMENT ON COLUMN tasks.exdates IS 'List of YYYY-MM-DD date strings representing occurrences to skip in the recurrence pattern.';
COMMENT ON COLUMN tasks.parent_id IS 'Points to the master recurring task if this is a single-occurrence exception.';
