-- The project-level default privileges grant all table capabilities to API
-- roles. Growth data is account-private, so remove that inherited surface and
-- grant back only the four operations used by the signed-in browser client.

revoke all privileges on table
  public.growth_days,
  public.growth_achievements,
  public.growth_journeys,
  public.growth_journey_days
from anon;

revoke all privileges on table
  public.growth_days,
  public.growth_achievements,
  public.growth_journeys,
  public.growth_journey_days
from authenticated;

grant select, insert, update, delete on table
  public.growth_days,
  public.growth_achievements,
  public.growth_journeys,
  public.growth_journey_days
to authenticated;
