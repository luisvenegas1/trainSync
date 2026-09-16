-- ¿En qué org está un ENTRENADOR (staff)?
select u.email, om.role, o.slug, o.id as org_id
from auth.users u
join public.organization_members om on om.user_id = u.id
join public.organizations o on o.id = om.organization_id
where u.email = 'coach1-gimnasio-premium@test.local';

-- ¿Y un CLIENTE?
select id, email, organization_id from public.users
where email = 'cliente2-gimnasio-premium@test.local';