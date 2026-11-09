-- The S3 key of an alert's image, if it has one.
alter table alert_messages add column image_key text;
