-- History is written by the server from the live document, never by browsers. Applied
-- after the code that saves through member_save_document_state is deployed.
revoke insert on public.document_versions from anon, authenticated;
drop policy if exists "Editors save versions" on public.document_versions;
