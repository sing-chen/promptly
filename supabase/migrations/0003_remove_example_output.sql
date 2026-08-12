-- Removes prompts.example_output - the feature (an attached example image
-- on the prompt detail page, v3-era) is deferred to a possible future
-- version, not shipped in the account-tier product; see BUILD_BRIEF_v4.md
-- §7 and BUILD_BRIEF.md's status note for where it's tracked. Run this once
-- against your project (SQL Editor) after pulling the app code that stopped
-- reading/writing this column.
--
-- Destructive: this permanently discards whatever is currently stored in
-- example_output for every row. Back up first if you want to keep it (e.g.
-- `select id, example_output from prompts where example_output is not null;`).

-- mark_edited_from_source (0001/0002) checks example_output as one of the
-- fields that marks a fork "edited from source" - redefine it without that
-- check before dropping the column out from under it.
create or replace function mark_edited_from_source() returns trigger as $$
begin
  if new.source_prompt_id is not null and old.source_prompt_id is not null then
    if new.title is distinct from old.title
      or new.categories is distinct from old.categories
      or new.purpose is distinct from old.purpose
      or new.body is distinct from old.body
      or new.notes is distinct from old.notes
    then
      new.edited_from_source = true;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

alter table prompts drop column if exists example_output;
