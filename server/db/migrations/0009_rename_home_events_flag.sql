-- The front page's events flag became a part of the events flag.
UPDATE "feature_flag" SET "key" = 'events.home' WHERE "key" = 'homeEvents';
