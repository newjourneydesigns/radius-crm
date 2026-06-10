-- ============================================================
-- STEP 0: Diagnostics — run these first and review the results
-- ============================================================

-- How many active circle leaders already have a ccb_group_id stored?
SELECT count(*) AS total_active, count(ccb_group_id) AS with_ccb_group_id
FROM circle_leaders WHERE status = 'active' AND leader_type = 'circle';

-- Leaders from the spreadsheet that exist in RADIUS but have NO ccb_group_id yet
-- (these will NOT be matched by the UPDATE statements below and may end up as
-- duplicate INSERTs — review this list before running Step 2).
SELECT id, name, campus, circle_name, ccb_group_id
FROM circle_leaders
WHERE ccb_group_id IS NULL
  AND lower(name) IN ('aaron turrubiarte', 'bobby mcmurtrey', 'brian cummins', 'bryce lawler', 'carla mcmurtrey', 'charity price', 'christee cheatham', 'cody kovach', 'courtney lawler', 'dawson shields', 'edwin rodriguez', 'eric sommerhauser', 'isaiah sims', 'jane flowers', 'jay cheatham', 'jeff endo', 'jeff simeral', 'jill coulter', 'jonathan mosesman', 'joshua marshall', 'karrie johnston', 'kate sommerhauser', 'kristina buckett', 'latosha guthrie', 'michael rodriguez', 'nancy hamm', 'nick blair', 'randy copeland', 'robert littlefield', 'samantha stevens', 'sierra walesa', 'stone hawkins', 'alvaro herrera', 'andrew hoefler', 'brad lanham', 'brett vaughan', 'brian white', 'darrell brown', 'david housel', 'david strider', 'eddie loya', 'eric morris', 'gary fullerton', 'jeff polley', 'jeffery price', 'jeff sackett', 'john hodges', 'john liddle', 'jordan waller', 'jorge zavala', 'kenneth dakin', 'lance sumpter', 'landon gann', 'mark demoss', 'matthew merz', 'steve barber', 'tom dollahite', 'tony martinez', 'zack barger', 'amanda frevert', 'anna reynolds', 'briana lanham', 'caleb chapple', 'carrie comstock', 'chris pitt', 'christi mccarty', 'garrett heath', 'greg atwell', 'haley nall', 'hunter nall', 'jim walker', 'john dougherty', 'justin lanham', 'kate hilsabeck', 'kerry hillier', 'lexie wood', 'loriann gilbert', 'mary lee', 'nancy spencer', 'rosemary corbett', 'wendy earley', 'zach welch', 'ally salls', 'amy duininck', 'ben moreno', 'esther perry', 'chris kozen', 'david scriven', 'david huntley', 'heather mungeer', 'jason hillier', 'joshua robinson', 'kristina williams', 'lauren boyes', 'mary wallace', 'michelle edwards', 'rebekah baus', 'richard siler', 'riley adams', 'allison greenawalt', 'sarah heath', 'sarah henninger', 'sebastian mancillas', 'terra klarich', 'tony ciaccio', 'whittney helvey', 'blake howard', 'bret moore', 'brian schoenhofer', 'bruce birdsong', 'carla rolinc', 'carrie grebliunas', 'chad gregg', 'chris root', 'christian kaprelian', 'dakota artiaga', 'dylan lewis', 'emily saller', 'emily scheer', 'eric erlandson', 'stephanie shutt', 'grant webb', 'jay borowy', 'joe monden', 'christy lewis', 'justin day', 'katie kaprelian', 'kaye campbell', 'laura johnston', 'laurie tjosvold', 'manny roman', 'matt grebliunas', 'matt saller', 'mike browne', 'nicholas ponomarenko', 'stephanie schoenhofer', 'taylor day', 'tony dominguez', 'amanda duke', 'amy ferrara', 'bryce hamilton', 'carl smith', 'charles pierce', 'colton nicholas', 'cris murray', 'jeff woods', 'jimmy mcafee', 'laura impey', 'lottie bernecker', 'mina wynn', 'patt bowles', 'robert shields', 'tara meche', 'todd baden', 'trip ochenski', 'april maynard', 'john cash', 'john stickl', 'laurie shea', 'lynn roush');

-- ============================================================
-- STEP 1: Fill gaps on existing leaders matched by CCB group ID
-- ============================================================
BEGIN;

-- DNT | S1 | Aaron Turrubiarte
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Aaron@synresllc.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 206-7290'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Aaron Turrubiarte'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/77972'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3365')
WHERE ccb_group_id = '3365';

-- DNT | S1 | Bobby McMurtrey
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'onpointrealtyteam@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 765-5609'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Bobby McMurtrey'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74582'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=678')
WHERE ccb_group_id = '678';

-- DNT | S1 | Brian & Patty Cummins
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'bacummins83@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(951) 906-2012'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Brian & Patty Cummins'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92131'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3357')
WHERE ccb_group_id = '3357';

-- DNT | S1 | Bryce Lawler
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'royals4000@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 595-2450'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Bryce Lawler'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88161'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3304')
WHERE ccb_group_id = '3304';

-- DNT | S1 | Carla McMurtrey
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'carladawn.m@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(210) 508-8117'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Carla McMurtrey'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/17225'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2599')
WHERE ccb_group_id = '2599';

-- DNT | S1 | Charity Price
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'charity.price@aol.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 998-7036'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Charity Price'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/17965'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2598')
WHERE ccb_group_id = '2598';

-- DNT | S1 | Christee Cheatham
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ccheathm@pobox.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 569-7329'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Christee Cheatham'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/56292'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=674')
WHERE ccb_group_id = '674';

-- DNT | S1 | Cody Kovach
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Ckovach93@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 755-6817'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Cody Kovach'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/54484'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3088')
WHERE ccb_group_id = '3088';

-- DNT | S1 | Courtney Lawler
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'cdimarcodance@hotmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 395-5873'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Courtney Lawler'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/94193'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3358')
WHERE ccb_group_id = '3358';

-- DNT | S1 | Dawson and Emily Shields
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'dawson.shields@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 535-4644'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Dawson and Emily Shields'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Emily Shields'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/33373'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1860'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-07'::date)
WHERE ccb_group_id = '1860';

-- DNT | S1 | Edwin Rodriguez
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'edwin.rodriguez1@verizon.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 930-0449'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Edwin Rodriguez'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/31950'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3807')
WHERE ccb_group_id = '3807';

-- DNT | S1 | Eric Sommerhauser
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'eric.sommerhauser@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 206-7334'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Saturday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Eric Sommerhauser'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/73984'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3796')
WHERE ccb_group_id = '3796';

-- DNT | S1 | Isaiah Sims
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'isaiahdsims@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 230-1911'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Isaiah Sims'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/46082'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2816')
WHERE ccb_group_id = '2816';

-- DNT | S1 | Jane Flowers
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'flowersjane@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 394-0025'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Jane Flowers'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/45996'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=641')
WHERE ccb_group_id = '641';

-- DNT | S1 | Jay Cheatham
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Jaytc@pobox.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 441-2795'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Jay Cheatham'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/56291'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=675')
WHERE ccb_group_id = '675';

-- DNT | S1 | Jeff and Carole Endo
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), '4endos.fl@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(727) 466-8986'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Jeff and Carole Endo'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Carole Endo'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/55001'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=655')
WHERE ccb_group_id = '655';

-- DNT | S1 | Jeff Simeral
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jeff.simeral@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(720) 364-8825'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Jeff Simeral'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/83686'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2307')
WHERE ccb_group_id = '2307';

-- DNT | S1 | Jill Coulter
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jill.coulter0@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 391-5257'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Jill Coulter'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2986'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3674')
WHERE ccb_group_id = '3674';

-- DNT | S1 | Jonathan Mosesman
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jonathan.mosesman@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(580) 704-8955'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Jonathan Mosesman'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80389'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3005'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-03'::date)
WHERE ccb_group_id = '3005';

-- DNT | S1 | Joshua Marshall
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jmarshall.lmft@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 231-9669'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Joshua Marshall'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69432'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=672')
WHERE ccb_group_id = '672';

-- DNT | S1 | Karrie Johnston
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'karrie.johnston@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(979) 864-5169'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Karrie Johnston'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/38688'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3388')
WHERE ccb_group_id = '3388';

-- DNT | S1 | Kate Sommerhauser
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'kcsommerhauser@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 395-2109'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Kate Sommerhauser'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/13406'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3267')
WHERE ccb_group_id = '3267';

-- DNT | S1 | Kristina Buckett
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'kristinalissette@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 263-7672'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Kristina Buckett'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/25451'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=679')
WHERE ccb_group_id = '679';

-- DNT | S1 | Latosha Guthrie
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'tosha91079@hotmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(903) 821-2184'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Saturday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Latosha Guthrie'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/41829'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3887')
WHERE ccb_group_id = '3887';

-- DNT | S1 | Michael & Margie Rodriguez
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'mikearod2013@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 597-2400'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Michael & Margie Rodriguez'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75165'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1996')
WHERE ccb_group_id = '1996';

-- DNT | S1 | Nancy Hamm
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Nancy.hamm1@verizon.net'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 796-9995'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Nancy Hamm'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88906'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2403')
WHERE ccb_group_id = '2403';

-- DNT | S1 | Nick Blair
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'nick_blair1@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(682) 803-6006'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Nick Blair'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92910'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3552')
WHERE ccb_group_id = '3552';

-- DNT | S1 | Randy & Angela Copeland
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'rangiec05@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 989-0087'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Randy & Angela Copeland'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/97604'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3465')
WHERE ccb_group_id = '3465';

-- DNT | S1 | Robert Littlefield
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Robert_a_littlefield@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(803) 389-7549'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Saturday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Robert Littlefield'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/72510'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1888')
WHERE ccb_group_id = '1888';

-- DNT | S1 | Samantha Stevens
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'samanthastevens.tx@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 219-8594'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Eric Sommerhauser'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Samantha Stevens'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/83560'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3743'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-01'::date)
WHERE ccb_group_id = '3743';

-- DNT | S1 | Sierra Walesa
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'sierrarkeller8@hotmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 804-4378'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Sierra Walesa'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/20874'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3387')
WHERE ccb_group_id = '3387';

-- DNT | S1 | Stone Hawkins
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'stoneyhawkins10@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(903) 651-1842'),
  campus = COALESCE(NULLIF(campus, ''), 'Denton'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Dawson Shields'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'DNT | S1 | Stone Hawkins'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92396'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3797')
WHERE ccb_group_id = '3797';

-- FMT | S1 | Al Herrera
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Ana4alhe@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(267) 438-9358'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Al Herrera'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/6179'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=222')
WHERE ccb_group_id = '222';

-- FMT | S1 | Andrew Hoefler
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ahoefler3@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(720) 470-3787'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Andrew Hoefler'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/46892'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3848')
WHERE ccb_group_id = '3848';

-- FMT | S1 | Brad Lanham
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'brad.lanham@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 358-1000'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Brad Lanham'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/4'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2555')
WHERE ccb_group_id = '2555';

-- FMT | S1 | Brett Vaughan
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'brettvaughan@live.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 922-6695'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Brett Vaughan'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Jim Clark'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/19950'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=213')
WHERE ccb_group_id = '213';

-- FMT | S1 | Brian White
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'brian@bluefuserealty.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 403-9275'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Brian White'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/15117'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1360')
WHERE ccb_group_id = '1360';

-- FMT | S1 | Darrell Brown
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Darrellcbrown@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 864-2195'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Darrell Brown'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/53603'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=205')
WHERE ccb_group_id = '205';

-- FMT | S1 | David Housel
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'davidhousel@icloud.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 529-2863'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | David Housel'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68876'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2845')
WHERE ccb_group_id = '2845';

-- FMT | S1 | David Strider
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'coachstrider@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(323) 353-6210'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | David Strider'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Donnie Morris'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/38371'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3664')
WHERE ccb_group_id = '3664';

-- FMT | S1 | Eddie Loya
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Eloya@outlook.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 475-7860'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Eddie Loya'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68647'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1079')
WHERE ccb_group_id = '1079';

-- FMT | S1 | Eric Morris
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ericdmorris3@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 998-4378'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Eric Morris'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/78521'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=208')
WHERE ccb_group_id = '208';

-- FMT | S1 | Gary Fullerton
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'garydfullerton@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 366-8173'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Gary Fullerton'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/50249'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1509')
WHERE ccb_group_id = '1509';

-- FMT | S1 | Jeff Polley
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jetpolley@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 673-8976'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Jeff Polley'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/25801'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3090')
WHERE ccb_group_id = '3090';

-- FMT | S1 | Jeff Price
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'mlpricegroup@aol.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 674-3906'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Jeff Price'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'John Luke Spitler, John Dougherty, Chris Cunningham'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80347'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=198')
WHERE ccb_group_id = '198';

-- FMT | S1 | Jeff Sackett
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jjsack1@aol.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 773-1505'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Jeff Sackett'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Andre Tusant'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12315'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=212')
WHERE ccb_group_id = '212';

-- FMT | S1 | John Hodges
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Jhodges311@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 939-4624'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | John Hodges'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/31543'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2554')
WHERE ccb_group_id = '2554';

-- FMT | S1 | John Liddle
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jrliddle@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 231-2414'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | John Liddle'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/36015'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=148')
WHERE ccb_group_id = '148';

-- FMT | S1 | Jordan Waller
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jordan.waller@utexas.edu'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 739-2980'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Jordan Waller'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/91832'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=620')
WHERE ccb_group_id = '620';

-- FMT | S1 | Jorge Zavala
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jzavala@tatbilling.com'),
  phone = COALESCE(NULLIF(phone, ''), '(818) 518-6823'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Jorge Zavala'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/17055'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1054')
WHERE ccb_group_id = '1054';

-- FMT | S1 | Ken Dakin
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'kenneth.dakin@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 675-0799'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Ken Dakin'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75213'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=715')
WHERE ccb_group_id = '715';

-- FMT | S1 | Lance Sumpter
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'fmsump@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 687-7610'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Lance Sumpter'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Tony Martinez'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/37831'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=230')
WHERE ccb_group_id = '230';

-- FMT | S1 | Landon Gann
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'landongann@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 500-5102'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Landon Gann'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/4840'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1407')
WHERE ccb_group_id = '1407';

-- FMT | S1 | Mark DeMoss
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'MarkDeMoss5@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(734) 395-9155'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Mark DeMoss'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74220'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=219')
WHERE ccb_group_id = '219';

-- FMT | S1 | Matthew Merz
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'merzhome30@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 703-1399'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Matthew Merz'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68335'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=163')
WHERE ccb_group_id = '163';

-- FMT | S1 | Steve Barber
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Steve.e.barber@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 841-4525'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Steve Barber'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Brad Lanham'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/35705'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2913')
WHERE ccb_group_id = '2913';

-- FMT | S1 | Tom Dollahite
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'dollahit@aol.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 814-7417'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Tom Dollahite'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/3744'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=200')
WHERE ccb_group_id = '200';

-- FMT | S1 | Tony Martinez
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Tony@WilsonContractorServices.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 403-2567'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Tony Martinez'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/8898'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3798')
WHERE ccb_group_id = '3798';

-- FMT | S1 | Zack Barger
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'bargerzack@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 786-1204'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Hunter Nall'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S1 | Zack Barger'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/833'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3831'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-10'::date)
WHERE ccb_group_id = '3831';

-- FMT | S2 | Amanda Frevert
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'amandafrevert10@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(281) 799-6654'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Amanda Frevert'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/4718'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=257')
WHERE ccb_group_id = '257';

-- FMT | S2 | Anna Reynolds
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'romena22@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(719) 323-4718'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Anna Reynolds'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69718'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2323')
WHERE ccb_group_id = '2323';

-- FMT | S2 | Briana Lanham
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'briana.marie918@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 932-3941'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Briana Lanham'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/34921'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3406')
WHERE ccb_group_id = '3406';

-- FMT | S2 | Caleb Chapple
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'caleb.chapple@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 307-8997'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Caleb Chapple'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2437'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=625')
WHERE ccb_group_id = '625';

-- FMT | S2 | Carrie Comstock
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'bradleys.wife@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 948-3510'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Carrie Comstock'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2833'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2300')
WHERE ccb_group_id = '2300';

-- FMT | S2 | Chris Pitt
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'chris.pitt@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 395-2591'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Chris Pitt'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80273'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=236')
WHERE ccb_group_id = '236';

-- FMT | S2 | Christi McCarty
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'christimccarty@hotmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(512) 921-7116'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Christi McCarty'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69079'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1132')
WHERE ccb_group_id = '1132';

-- FMT | S2 | Garrett Heath
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'garrett.heath@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 558-2185'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Garrett Heath'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/34835'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=778')
WHERE ccb_group_id = '778';

-- FMT | S2 | Greg and Tori Atwell
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'gatwell13@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 816-2288'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Greg and Tori Atwell'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Tori Atwell'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/18186'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=244'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-11'::date)
WHERE ccb_group_id = '244';

-- FMT | S2 | Haley Nall
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'haleynallart8@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 529-6195'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Haley Nall'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/103416'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3520')
WHERE ccb_group_id = '3520';

-- FMT | S2 | Hunter Nall
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'hunter.nall@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 880-5225'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Hunter Nall'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/81551'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3516')
WHERE ccb_group_id = '3516';

-- FMT | S2 | Jim and Riley Walker
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jimnealwalker@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 367-4233'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Jim and Riley Walker'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Riley Walker'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69569'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2164')
WHERE ccb_group_id = '2164';

-- FMT | S2 | John and Jodee Dougherty
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'john.dougherty@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(215) 353-1832'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | John and Jodee Dougherty'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/84545'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3381')
WHERE ccb_group_id = '3381';

-- FMT | S2 | John Dougherty
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'john.dougherty@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(215) 353-1832'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | John Dougherty'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/84545'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=600')
WHERE ccb_group_id = '600';

-- FMT | S2 | Justin Lanham
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'justin.lanham@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 544-4104'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Justin Lanham'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/35428'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2838')
WHERE ccb_group_id = '2838';

-- FMT | S2 | Kate Hilsabeck
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'kate.hilsabeck@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 999-7398'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Kate Hilsabeck'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/6318'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3666')
WHERE ccb_group_id = '3666';

-- FMT | S2 | Kerry Hillier
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'kerry_hillier@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 795-0706'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Kerry Hillier'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/6310'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=255'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-03'::date)
WHERE ccb_group_id = '255';

-- FMT | S2 | Lexie Wood
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'lexie.wood@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 223-6090'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Lexie Wood'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/87573'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1839'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-01'::date)
WHERE ccb_group_id = '1839';

-- FMT | S2 | LoriAnn Gilbert
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'LoriannGilbert@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(925) 482-5090'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | LoriAnn Gilbert'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/87865'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3000')
WHERE ccb_group_id = '3000';

-- FMT | S2 | Mary Lee
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'evmarylee@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 803-6772'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Mary Lee'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/44967'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=271')
WHERE ccb_group_id = '271';

-- FMT | S2 | Ron and Nancy Spencer
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'nancy.spencer@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 697-4758'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Ron and Nancy Spencer'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/50605'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=265')
WHERE ccb_group_id = '265';

-- FMT | S2 | Rose Corbett
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'rose@christianrep.com'),
  phone = COALESCE(NULLIF(phone, ''), '(603) 560-8006'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Rose Corbett'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2919'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2420')
WHERE ccb_group_id = '2420';

-- FMT | S2 | Wendy Earley
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'wendy.earley@verizon.net'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 793-4916'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Wendy Earley'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/3965'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=274')
WHERE ccb_group_id = '274';

-- FMT | S2 | Zach Welch
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'zach.welch@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 770-5358'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Esther Perry'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S2 | Zach Welch'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/79008'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1613'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-02'::date)
WHERE ccb_group_id = '1613';

-- FMT | S3 | Ally Salls
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ally.salls@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 417-1544'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Ally Salls'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/78917'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=714')
WHERE ccb_group_id = '714';

-- FMT | S3 | Amy Duininck
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Amy.Duininck@icloud.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 223-7699'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Amy Duininck'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/3879'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=295'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-02'::date)
WHERE ccb_group_id = '295';

-- FMT | S3 | Ben Moreno
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ben.moreno@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 725-4965'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Ben Moreno'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9890'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1866')
WHERE ccb_group_id = '1866';

-- FMT | S3 | Chad and Esther Perry
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'esther.perry@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 740-0067'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Chad and Esther Perry'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/24834'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2834')
WHERE ccb_group_id = '2834';

-- FMT | S3 | Chris and Tracey Kozen
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'chris.kozen@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 395-4700'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Chris and Tracey Kozen'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Tracey Kozen'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/32058'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=300'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-07'::date)
WHERE ccb_group_id = '300';

-- FMT | S3 | Dave and Nicole Scriven
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'david.scriven@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(916) 605-6808'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Dave and Nicole Scriven'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Nicole Scriven'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12690'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2347')
WHERE ccb_group_id = '2347';

-- FMT | S3 | David Huntley
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'david.huntley@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 808-9529'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | David Huntley'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80271'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=206')
WHERE ccb_group_id = '206';

-- FMT | S3 | Heather Mungeer
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'heather.mungeer@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(646) 732-9273'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Heather Mungeer'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69581'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1151')
WHERE ccb_group_id = '1151';

-- FMT | S3 | Jason Hillier
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jason.hillier@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 906-9247'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Jason Hillier'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/72220'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=211')
WHERE ccb_group_id = '211';

-- FMT | S3 | Josh and Kristi Robinson
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jrobinsonaggie@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(979) 324-5674'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Josh and Kristi Robinson'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/22611'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3383')
WHERE ccb_group_id = '3383';

-- FMT | S3 | Kirk and Kristina Williams
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'kristina.renee2014@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(540) 760-4324'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Kirk and Kristina Williams'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Kirk Williams'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/66020'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1754'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-09'::date)
WHERE ccb_group_id = '1754';

-- FMT | S3 | Lauren Boyes
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Lauren.Boyes@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(713) 557-4771'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Lauren Boyes'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80284'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2319')
WHERE ccb_group_id = '2319';

-- FMT | S3 | Mary Wallace
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Cuteladywallace@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(541) 661-4565'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Mary Wallace'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/89494'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2914')
WHERE ccb_group_id = '2914';

-- FMT | S3 | Michelle Edwards
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'michannliv@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 683-7296'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Michelle Edwards'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74076'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3433')
WHERE ccb_group_id = '3433';

-- FMT | S3 | Rebekah Baus
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'rebekahbaus@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 979-9524'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Rebekah Baus'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/15685'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3899')
WHERE ccb_group_id = '3899';

-- FMT | S3 | Richard and Jennifer Siler
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'janddsiler@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 403-5368'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Richard and Jennifer Siler'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/13022'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3007')
WHERE ccb_group_id = '3007';

-- FMT | S3 | Riley Adams
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'riley.adams@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 251-9520'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Riley Adams'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/22283'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3091')
WHERE ccb_group_id = '3091';

-- FMT | S3 | Ryan and Allison Greenawalt
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'allisonggreenawalt@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 529-9373'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Coed'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Ryan and Allison Greenawalt'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Ryan Greenawalt'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/7015'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=316')
WHERE ccb_group_id = '316';

-- FMT | S3 | Sarah Heath
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'sarah.heath@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 965-5360'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Sarah Heath'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/26770'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2839')
WHERE ccb_group_id = '2839';

-- FMT | S3 | Sarah Henninger
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'henningersarah518@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 993-5829'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Sarah Henninger'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74946'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=287')
WHERE ccb_group_id = '287';

-- FMT | S3 | Sebastian Mancillas
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'sebastian.mancillas@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(682) 438-0327'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Sebastian Mancillas'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/70552'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3436')
WHERE ccb_group_id = '3436';

-- FMT | S3 | Terra Klarich
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Faktsm@aol.com'),
  phone = COALESCE(NULLIF(phone, ''), '(425) 830-8152'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Terra Klarich'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/78667'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=708'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-04'::date)
WHERE ccb_group_id = '708';

-- FMT | S3 | Tony and Kriston Ciaccio
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'tony.ciaccio@gmx.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 334-4720'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Tony and Kriston Ciaccio'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/42550'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3663'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-07'::date)
WHERE ccb_group_id = '3663';

-- FMT | S3 | Whittney Helvey
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'losh.whittney@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 890-4593'),
  campus = COALESCE(NULLIF(campus, ''), 'Flower Mound'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Chris Pitt'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'FMT | S3 | Whittney Helvey'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88240'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1257')
WHERE ccb_group_id = '1257';

-- GVT | S1 | Blake Howard
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'rbhoward07@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 865-8130'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Saturday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Blake Howard'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Joe Monden'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/77971'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=158')
WHERE ccb_group_id = '158';

-- GVT | S1 | Bret Moore
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'bretmoore82@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 727-4520'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Bret Moore'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/84440'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=744')
WHERE ccb_group_id = '744';

-- GVT | S1 | Brian Schoenhofer
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'brian.schoenhofer@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 395-2160'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Brian Schoenhofer'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80127'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=506')
WHERE ccb_group_id = '506';

-- GVT | S1 | Bruce Birdsong
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'bruce@tejasranch.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 957-3361'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Bruce Birdsong'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Sheree Birdsong'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68566'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1848'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-11'::date)
WHERE ccb_group_id = '1848';

-- GVT | S1 | Carla Rolinc
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'crolinc@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 223-4807'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Carla Rolinc'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/93212'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3008')
WHERE ccb_group_id = '3008';

-- GVT | S1 | Carrie Grebliunas
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'carriegrebliunas@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 641-1153'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Carrie Grebliunas'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/29889'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2846')
WHERE ccb_group_id = '2846';

-- GVT | S1 | Chad Gregg
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Chad@enderbygas.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 736-3490'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Chad Gregg'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/71260'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2604')
WHERE ccb_group_id = '2604';

-- GVT | S1 | Chris Root
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'rroost@ntin.net'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 736-9928'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Chris Root'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12106'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1572')
WHERE ccb_group_id = '1572';

-- GVT | S1 | Christian Kaprelian
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ckaprelian@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 968-7245'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Christian Kaprelian'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/42698'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=507')
WHERE ccb_group_id = '507';

-- GVT | S1 | Dakota Artiaga
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'artiagadakota06@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 612-9262'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Dakota Artiaga'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/94568'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3679')
WHERE ccb_group_id = '3679';

-- GVT | S1 | Dylan Lewis
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Lewisdylan042399@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(417) 312-7798'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Dylan Lewis'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92128'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3680')
WHERE ccb_group_id = '3680';

-- GVT | S1 | Emily Saller
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'EMILY@DLFARMHOME.COM'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 390-0466'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Emily Saller'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/91297'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1847')
WHERE ccb_group_id = '1847';

-- GVT | S1 | Emily Scheer
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'emscheer4@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(573) 999-7024'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Emily Scheer'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/87175'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3221')
WHERE ccb_group_id = '3221';

-- GVT | S1 | Eric Erlandson
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'eric.erlandson@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 736-1549'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Eric Erlandson'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/70538'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3734')
WHERE ccb_group_id = '3734';

-- GVT | S1 | Eric Shutt
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'stephanielshutt@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 977-9500'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Eric Shutt'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Eric Shutt'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12982'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1404')
WHERE ccb_group_id = '1404';

-- GVT | S1 | Grant Webb
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'grantw_lvn@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 736-4031'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Grant Webb'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92364'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3681')
WHERE ccb_group_id = '3681';

-- GVT | S1 | Jay Borowy
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'borowyjay@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 703-9091'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Jay Borowy'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Carly Borowy'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/72253'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=154')
WHERE ccb_group_id = '154';

-- GVT | S1 | Joe Monden
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jmracecars@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 727-3655'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Joe Monden'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Lynn Monden'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9777'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=155')
WHERE ccb_group_id = '155';

-- GVT | S1 | Joel Lewis
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jewel4jesus2001@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 390-6671'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Joel Lewis'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Joel Lewis'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/23811'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=748')
WHERE ccb_group_id = '748';

-- GVT | S1 | Justin Day
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Justintday13@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 443-0587'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Justin Day'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/73913'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2602')
WHERE ccb_group_id = '2602';

-- GVT | S1 | Katie Kaprelian
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'katie.kaprelian@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 968-7788'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Katie Kaprelian'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/42699'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2732'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-14'::date)
WHERE ccb_group_id = '2732';

-- GVT | S1 | Kaye Campbell
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Cunina@sbcglobal.net'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 736-6575'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Kaye Campbell'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/57417'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1489')
WHERE ccb_group_id = '1489';

-- GVT | S1 | Laura Johnston
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'llh.johnston@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(979) 848-6757'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Laura Johnston'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/64421'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3540')
WHERE ccb_group_id = '3540';

-- GVT | S1 | Laurie Tjosvold
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ltjosvold@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 226-0519'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Laurie Tjosvold'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/14287'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1245')
WHERE ccb_group_id = '1245';

-- GVT | S1 | Manny Roman
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'emanuelroman@live.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 688-1261'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Saturday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Manny Roman'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/90596'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3222')
WHERE ccb_group_id = '3222';

-- GVT | S1 | Matt Grebliunas
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'mattgrebliunas@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(903) 520-0536'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Matt Grebliunas'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/29888'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3736')
WHERE ccb_group_id = '3736';

-- GVT | S1 | Matt Saller
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'matt@dlfarmhome.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 714-7749'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Matt Saller'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/91298'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3371')
WHERE ccb_group_id = '3371';

-- GVT | S1 | Mike Browne
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Mikebrowne76@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(810) 836-5830'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Mike Browne'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/85371'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1849')
WHERE ccb_group_id = '1849';

-- GVT | S1 | Nick Ponomarenko
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'napono56@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(559) 301-4256'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Nick Ponomarenko'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68699'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=575')
WHERE ccb_group_id = '575';

-- GVT | S1 | Stephanie Schoenhofer
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Sshow3@hotmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(316) 259-8427'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Stephanie Schoenhofer'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75337'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=580')
WHERE ccb_group_id = '580';

-- GVT | S1 | Taylor Day
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'taylor.day@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 923-9254'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Taylor Day'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75984'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2601')
WHERE ccb_group_id = '2601';

-- GVT | S1 | Tony Dominguez
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Tobyd0844@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 381-6922'),
  campus = COALESCE(NULLIF(campus, ''), 'Gainesville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Brian Schoenhofer'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Tuesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'GVT | S1 | Tony Dominguez'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/81657'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3180')
WHERE ccb_group_id = '3180';

-- LVT | S1 | Amanda Duke
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'dukeam@ymail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(316) 250-2081'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Amanda Duke'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/35397'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3143')
WHERE ccb_group_id = '3143';

-- LVT | S1 | Amy Ferrera
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'anderson_amy76@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 342-7490'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Amy Ferrera'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/53868'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3415')
WHERE ccb_group_id = '3415';

-- LVT | S1 | Bryce Hamilton
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'bryce.hamilton90@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 995-9822'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Bryce Hamilton'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/97036'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2255')
WHERE ccb_group_id = '2255';

-- LVT | S1 | Carl and Karin Smith
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'skeeziks3@charter.net'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 205-0970'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Carl and Karin Smith'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Karin Smith'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/79248'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=775'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-14'::date)
WHERE ccb_group_id = '775';

-- LVT | S1 | Charles and Nancy Pierce
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Cpierce11@tx.rr.com'),
  phone = COALESCE(NULLIF(phone, ''), '(469) 744-7380'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Charles and Nancy Pierce'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Nancy Pierce'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/71695'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1475'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-04'::date)
WHERE ccb_group_id = '1475';

-- LVT | S1 | Colton Nicholas
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'colton.nicholas@icloud.com'),
  phone = COALESCE(NULLIF(phone, ''), '(512) 221-3232'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'YA | Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Monday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Colton Nicholas'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80957'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1072')
WHERE ccb_group_id = '1072';

-- LVT | S1 | Cris Murray
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'getacar04@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 566-9461'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Cris Murray'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/34371'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=162')
WHERE ccb_group_id = '162';

-- LVT | S1 | Jeff Woods
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jtwoods0817@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 849-1468'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Jeff Woods'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/79235'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2139')
WHERE ccb_group_id = '2139';

-- LVT | S1 | Jimmy & Kim McAfee
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jimmy.mcafee1@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 206-6490'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Jimmy & Kim McAfee'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9064'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3134'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-11'::date)
WHERE ccb_group_id = '3134';

-- LVT | S1 | Laura Impey
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Lauraeimpey@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(571) 447-3576'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Laura Impey'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/48435'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2108')
WHERE ccb_group_id = '2108';

-- LVT | S1 | Lottie Bernecker
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'Llynk3@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(715) 458-6558'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Lottie Bernecker'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69937'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3233')
WHERE ccb_group_id = '3233';

-- LVT | S1 | Mina Wynn
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'm.wynn60@yahoo.com'),
  phone = COALESCE(NULLIF(phone, ''), '(940) 268-8500'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Sunday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Bi-weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Mina Wynn'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74338'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=330'),
  meeting_start_date = COALESCE(meeting_start_date, '2026-06-07'::date)
WHERE ccb_group_id = '330';

-- LVT | S1 | Patt Bowles
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'lonestarpatt@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 533-4474'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Patt Bowles'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/58292'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=859')
WHERE ccb_group_id = '859';

-- LVT | S1 | Rob Shields
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'robert.shields@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(214) 425-5905'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Rob Shields'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12912'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1118')
WHERE ccb_group_id = '1118';

-- LVT | S1 | Tara Meche
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'tara.meche01@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 829-5499'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Tara Meche'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/22715'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3212')
WHERE ccb_group_id = '3212';

-- LVT | S1 | Todd Baden
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'todd.baden@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 210-9468'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Friday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Todd Baden'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/1'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=324')
WHERE ccb_group_id = '324';

-- LVT | S1 | Trip Ochenski
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'trip.ochenski@valleycreek.org'),
  phone = COALESCE(NULLIF(phone, ''), '(972) 467-5988'),
  campus = COALESCE(NULLIF(campus, ''), 'Lewisville'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Trip Ochenski'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'LVT | S1 | Trip Ochenski'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3682')
WHERE ccb_group_id = '3682';

-- ONL | S1 | April Maynard
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'amajldm@msn.com'),
  phone = COALESCE(NULLIF(phone, ''), '(907) 687-6781'),
  campus = COALESCE(NULLIF(campus, ''), 'Online'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Taylor Cole'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'ONL | S1 | April Maynard'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/70776'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3389')
WHERE ccb_group_id = '3389';

-- ONL | S1 | John and Marylou Cash
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'johnacash@verizon.net'),
  phone = COALESCE(NULLIF(phone, ''), '(817) 501-3618'),
  campus = COALESCE(NULLIF(campus, ''), 'Online'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Taylor Cole'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Couples'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'ONL | S1 | John and Marylou Cash'),
  additional_leader_name = COALESCE(NULLIF(additional_leader_name, ''), 'Marylou Cash'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/66163'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=711')
WHERE ccb_group_id = '711';

-- ONL | S1 | John Stickl Sr.
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'jwstickl@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(716) 907-7344'),
  campus = COALESCE(NULLIF(campus, ''), 'Online'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Taylor Cole'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'ONL | S1 | John Stickl Sr.'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/13711'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1330')
WHERE ccb_group_id = '1330';

-- ONL | S1 | Laurie Shea
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'lawlaur915@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(540) 295-2420'),
  campus = COALESCE(NULLIF(campus, ''), 'Online'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Taylor Cole'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Women''s'),
  day = COALESCE(NULLIF(day, ''), 'Thursday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'ONL | S1 | Laurie Shea'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88482'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2110')
WHERE ccb_group_id = '2110';

-- ONL | S1 | Lynn Roush
UPDATE circle_leaders SET
  email = COALESCE(NULLIF(email, ''), 'ljroush714@gmail.com'),
  phone = COALESCE(NULLIF(phone, ''), '(301) 661-4411'),
  campus = COALESCE(NULLIF(campus, ''), 'Online'),
  acpd = COALESCE(NULLIF(acpd, ''), 'Taylor Cole'),
  status = COALESCE(NULLIF(status, ''), 'active'),
  circle_type = COALESCE(NULLIF(circle_type, ''), 'Men''s'),
  day = COALESCE(NULLIF(day, ''), 'Wednesday'),
  frequency = COALESCE(NULLIF(frequency, ''), 'Weekly'),
  circle_name = COALESCE(NULLIF(circle_name, ''), 'ONL | S1 | Lynn Roush'),
  leader_ccb_profile_link = COALESCE(NULLIF(leader_ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92254'),
  ccb_profile_link = COALESCE(NULLIF(ccb_profile_link, ''), 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=145')
WHERE ccb_group_id = '145';

COMMIT;

-- ============================================================
-- STEP 2: Insert circles with no existing match (by ccb_group_id)
-- Review STEP 0 results first — if a leader appears there without
-- a ccb_group_id, consider manually setting their ccb_group_id
-- instead of letting this create a second record for them.
-- ============================================================
BEGIN;

-- DNT | S1 | Aaron Turrubiarte
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Aaron Turrubiarte', 'DNT | S1 | Aaron Turrubiarte', 'Denton', 'Dawson Shields', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3365', '3365', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/77972', false, 'Aaron@synresllc.com', '(940) 206-7290'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3365');

-- DNT | S1 | Bobby McMurtrey
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Bobby McMurtrey', 'DNT | S1 | Bobby McMurtrey', 'Denton', 'Dawson Shields', 'active', 'Men''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=678', '678', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74582', false, 'onpointrealtyteam@gmail.com', '(940) 765-5609'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '678');

-- DNT | S1 | Brian & Patty Cummins
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Brian Cummins', 'DNT | S1 | Brian & Patty Cummins', 'Denton', 'Eric Sommerhauser', 'active', 'Couples', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3357', '3357', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92131', false, 'bacummins83@gmail.com', '(951) 906-2012'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3357');

-- DNT | S1 | Bryce Lawler
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Bryce Lawler', 'DNT | S1 | Bryce Lawler', 'Denton', 'Eric Sommerhauser', 'active', 'YA | Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3304', '3304', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88161', false, 'royals4000@gmail.com', '(940) 595-2450'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3304');

-- DNT | S1 | Carla McMurtrey
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Carla McMurtrey', 'DNT | S1 | Carla McMurtrey', 'Denton', 'Dawson Shields', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2599', '2599', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/17225', false, 'carladawn.m@gmail.com', '(210) 508-8117'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2599');

-- DNT | S1 | Charity Price
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Charity Price', 'DNT | S1 | Charity Price', 'Denton', 'Eric Sommerhauser', 'active', 'Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2598', '2598', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/17965', false, 'charity.price@aol.com', '(972) 998-7036'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2598');

-- DNT | S1 | Christee Cheatham
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Christee Cheatham', 'DNT | S1 | Christee Cheatham', 'Denton', 'Dawson Shields', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=674', '674', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/56292', false, 'ccheathm@pobox.com', '(469) 569-7329'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '674');

-- DNT | S1 | Cody Kovach
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Cody Kovach', 'DNT | S1 | Cody Kovach', 'Denton', 'Eric Sommerhauser', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3088', '3088', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/54484', false, 'Ckovach93@gmail.com', '(214) 755-6817'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3088');

-- DNT | S1 | Courtney Lawler
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Courtney Lawler', 'DNT | S1 | Courtney Lawler', 'Denton', 'Eric Sommerhauser', 'active', 'YA | Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3358', '3358', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/94193', false, 'cdimarcodance@hotmail.com', '(940) 395-5873'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3358');

-- DNT | S1 | Dawson and Emily Shields
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name, meeting_start_date)
SELECT 'circle', 'Dawson Shields', 'DNT | S1 | Dawson and Emily Shields', 'Denton', 'Dawson Shields', 'active', 'Couples', 'Sunday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1860', '1860', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/33373', false, 'dawson.shields@valleycreek.org', '(940) 535-4644', 'Emily Shields', '2026-06-07'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1860');

-- DNT | S1 | Edwin Rodriguez
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Edwin Rodriguez', 'DNT | S1 | Edwin Rodriguez', 'Denton', 'Dawson Shields', 'active', 'Men''s', 'Thursday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3807', '3807', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/31950', false, 'edwin.rodriguez1@verizon.com', '(214) 930-0449'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3807');

-- DNT | S1 | Eric Sommerhauser
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Eric Sommerhauser', 'DNT | S1 | Eric Sommerhauser', 'Denton', 'Eric Sommerhauser', 'active', 'YA | Men''s', 'Saturday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3796', '3796', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/73984', false, 'eric.sommerhauser@valleycreek.org', '(214) 206-7334'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3796');

-- DNT | S1 | Isaiah Sims
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Isaiah Sims', 'DNT | S1 | Isaiah Sims', 'Denton', 'Dawson Shields', 'active', 'YA | Men''s', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2816', '2816', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/46082', false, 'isaiahdsims@gmail.com', '(940) 230-1911'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2816');

-- DNT | S1 | Jane Flowers
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jane Flowers', 'DNT | S1 | Jane Flowers', 'Denton', 'Eric Sommerhauser', 'active', 'Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=641', '641', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/45996', false, 'flowersjane@gmail.com', '(214) 394-0025'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '641');

-- DNT | S1 | Jay Cheatham
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jay Cheatham', 'DNT | S1 | Jay Cheatham', 'Denton', 'Dawson Shields', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=675', '675', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/56291', false, 'Jaytc@pobox.com', '(469) 441-2795'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '675');

-- DNT | S1 | Jeff and Carole Endo
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Jeff Endo', 'DNT | S1 | Jeff and Carole Endo', 'Denton', 'Dawson Shields', 'active', 'Couples', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=655', '655', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/55001', false, '4endos.fl@gmail.com', '(727) 466-8986', 'Carole Endo'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '655');

-- DNT | S1 | Jeff Simeral
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jeff Simeral', 'DNT | S1 | Jeff Simeral', 'Denton', 'Dawson Shields', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2307', '2307', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/83686', false, 'jeff.simeral@valleycreek.org', '(720) 364-8825'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2307');

-- DNT | S1 | Jill Coulter
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jill Coulter', 'DNT | S1 | Jill Coulter', 'Denton', 'Dawson Shields', 'active', 'Women''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3674', '3674', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2986', false, 'jill.coulter0@gmail.com', '(940) 391-5257'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3674');

-- DNT | S1 | Jonathan Mosesman
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Jonathan Mosesman', 'DNT | S1 | Jonathan Mosesman', 'Denton', 'Eric Sommerhauser', 'active', 'Men''s', 'Wednesday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3005', '3005', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80389', false, 'jonathan.mosesman@valleycreek.org', '(580) 704-8955', '2026-06-03'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3005');

-- DNT | S1 | Joshua Marshall
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Joshua Marshall', 'DNT | S1 | Joshua Marshall', 'Denton', 'Eric Sommerhauser', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=672', '672', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69432', false, 'jmarshall.lmft@gmail.com', '(940) 231-9669'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '672');

-- DNT | S1 | Karrie Johnston
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Karrie Johnston', 'DNT | S1 | Karrie Johnston', 'Denton', 'Dawson Shields', 'active', 'YA | Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3388', '3388', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/38688', false, 'karrie.johnston@valleycreek.org', '(979) 864-5169'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3388');

-- DNT | S1 | Kate Sommerhauser
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Kate Sommerhauser', 'DNT | S1 | Kate Sommerhauser', 'Denton', 'Eric Sommerhauser', 'active', 'Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3267', '3267', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/13406', false, 'kcsommerhauser@yahoo.com', '(940) 395-2109'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3267');

-- DNT | S1 | Kristina Buckett
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Kristina Buckett', 'DNT | S1 | Kristina Buckett', 'Denton', 'Dawson Shields', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=679', '679', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/25451', false, 'kristinalissette@gmail.com', '(214) 263-7672'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '679');

-- DNT | S1 | Latosha Guthrie
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Latosha Guthrie', 'DNT | S1 | Latosha Guthrie', 'Denton', 'Dawson Shields', 'active', 'Women''s', 'Saturday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3887', '3887', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/41829', false, 'tosha91079@hotmail.com', '(903) 821-2184'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3887');

-- DNT | S1 | Michael & Margie Rodriguez
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Michael Rodriguez', 'DNT | S1 | Michael & Margie Rodriguez', 'Denton', 'Eric Sommerhauser', 'active', 'Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1996', '1996', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75165', false, 'mikearod2013@gmail.com', '(940) 597-2400'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1996');

-- DNT | S1 | Nancy Hamm
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Nancy Hamm', 'DNT | S1 | Nancy Hamm', 'Denton', 'Eric Sommerhauser', 'active', 'Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2403', '2403', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88906', false, 'Nancy.hamm1@verizon.net', '(214) 796-9995'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2403');

-- DNT | S1 | Nick Blair
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Nick Blair', 'DNT | S1 | Nick Blair', 'Denton', 'Dawson Shields', 'active', 'Men''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3552', '3552', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92910', false, 'nick_blair1@yahoo.com', '(682) 803-6006'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3552');

-- DNT | S1 | Randy & Angela Copeland
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Randy Copeland', 'DNT | S1 | Randy & Angela Copeland', 'Denton', 'Eric Sommerhauser', 'active', 'Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3465', '3465', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/97604', false, 'rangiec05@gmail.com', '(972) 989-0087'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3465');

-- DNT | S1 | Robert Littlefield
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Robert Littlefield', 'DNT | S1 | Robert Littlefield', 'Denton', 'Eric Sommerhauser', 'active', 'Men''s', 'Saturday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1888', '1888', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/72510', false, 'Robert_a_littlefield@yahoo.com', '(803) 389-7549'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1888');

-- DNT | S1 | Samantha Stevens
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Samantha Stevens', 'DNT | S1 | Samantha Stevens', 'Denton', 'Eric Sommerhauser', 'active', 'Women''s', 'Monday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3743', '3743', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/83560', false, 'samanthastevens.tx@gmail.com', '(817) 219-8594', '2026-06-01'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3743');

-- DNT | S1 | Sierra Walesa
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Sierra Walesa', 'DNT | S1 | Sierra Walesa', 'Denton', 'Dawson Shields', 'active', 'YA | Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3387', '3387', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/20874', false, 'sierrarkeller8@hotmail.com', '(972) 804-4378'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3387');

-- DNT | S1 | Stone Hawkins
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Stone Hawkins', 'DNT | S1 | Stone Hawkins', 'Denton', 'Dawson Shields', 'active', 'Couples', 'Sunday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3797', '3797', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92396', false, 'stoneyhawkins10@gmail.com', '(903) 651-1842'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3797');

-- FMT | S1 | Al Herrera
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Alvaro Herrera', 'FMT | S1 | Al Herrera', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=222', '222', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/6179', false, 'Ana4alhe@yahoo.com', '(267) 438-9358'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '222');

-- FMT | S1 | Andrew Hoefler
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Andrew Hoefler', 'FMT | S1 | Andrew Hoefler', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3848', '3848', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/46892', false, 'ahoefler3@gmail.com', '(720) 470-3787'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3848');

-- FMT | S1 | Brad Lanham
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Brad Lanham', 'FMT | S1 | Brad Lanham', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2555', '2555', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/4', false, 'brad.lanham@valleycreek.org', '(972) 358-1000'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2555');

-- FMT | S1 | Brett Vaughan
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Brett Vaughan', 'FMT | S1 | Brett Vaughan', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=213', '213', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/19950', false, 'brettvaughan@live.com', '(972) 922-6695', 'Jim Clark'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '213');

-- FMT | S1 | Brian White
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Brian White', 'FMT | S1 | Brian White', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1360', '1360', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/15117', false, 'brian@bluefuserealty.com', '(817) 403-9275'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1360');

-- FMT | S1 | Darrell Brown
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Darrell Brown', 'FMT | S1 | Darrell Brown', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=205', '205', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/53603', false, 'Darrellcbrown@yahoo.com', '(214) 864-2195'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '205');

-- FMT | S1 | David Housel
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'David Housel', 'FMT | S1 | David Housel', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2845', '2845', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68876', false, 'davidhousel@icloud.com', '(214) 529-2863'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2845');

-- FMT | S1 | David Strider
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'David Strider', 'FMT | S1 | David Strider', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3664', '3664', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/38371', false, 'coachstrider@yahoo.com', '(323) 353-6210', 'Donnie Morris'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3664');

-- FMT | S1 | Eddie Loya
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Eddie Loya', 'FMT | S1 | Eddie Loya', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1079', '1079', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68647', false, 'Eloya@outlook.com', '(469) 475-7860'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1079');

-- FMT | S1 | Eric Morris
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Eric Morris', 'FMT | S1 | Eric Morris', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=208', '208', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/78521', false, 'ericdmorris3@yahoo.com', '(972) 998-4378'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '208');

-- FMT | S1 | Gary Fullerton
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Gary Fullerton', 'FMT | S1 | Gary Fullerton', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1509', '1509', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/50249', false, 'garydfullerton@yahoo.com', '(817) 366-8173'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1509');

-- FMT | S1 | Jeff Polley
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jeff Polley', 'FMT | S1 | Jeff Polley', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3090', '3090', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/25801', false, 'jetpolley@gmail.com', '(817) 673-8976'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3090');

-- FMT | S1 | Jeff Price
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Jeffery Price', 'FMT | S1 | Jeff Price', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=198', '198', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80347', false, 'mlpricegroup@aol.com', '(214) 674-3906', 'John Luke Spitler, John Dougherty, Chris Cunningham'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '198');

-- FMT | S1 | Jeff Sackett
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Jeff Sackett', 'FMT | S1 | Jeff Sackett', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=212', '212', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12315', false, 'jjsack1@aol.com', '(214) 773-1505', 'Andre Tusant'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '212');

-- FMT | S1 | John Hodges
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'John Hodges', 'FMT | S1 | John Hodges', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2554', '2554', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/31543', false, 'Jhodges311@gmail.com', '(469) 939-4624'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2554');

-- FMT | S1 | John Liddle
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'John Liddle', 'FMT | S1 | John Liddle', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=148', '148', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/36015', false, 'jrliddle@gmail.com', '(940) 231-2414'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '148');

-- FMT | S1 | Jordan Waller
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jordan Waller', 'FMT | S1 | Jordan Waller', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=620', '620', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/91832', false, 'jordan.waller@utexas.edu', '(817) 739-2980'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '620');

-- FMT | S1 | Jorge Zavala
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jorge Zavala', 'FMT | S1 | Jorge Zavala', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1054', '1054', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/17055', false, 'jzavala@tatbilling.com', '(818) 518-6823'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1054');

-- FMT | S1 | Ken Dakin
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Kenneth Dakin', 'FMT | S1 | Ken Dakin', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=715', '715', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75213', false, 'kenneth.dakin@gmail.com', '(214) 675-0799'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '715');

-- FMT | S1 | Lance Sumpter
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Lance Sumpter', 'FMT | S1 | Lance Sumpter', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=230', '230', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/37831', false, 'fmsump@gmail.com', '(214) 687-7610', 'Tony Martinez'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '230');

-- FMT | S1 | Landon Gann
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Landon Gann', 'FMT | S1 | Landon Gann', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1407', '1407', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/4840', false, 'landongann@gmail.com', '(214) 500-5102'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1407');

-- FMT | S1 | Mark DeMoss
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Mark DeMoss', 'FMT | S1 | Mark DeMoss', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=219', '219', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74220', false, 'MarkDeMoss5@gmail.com', '(734) 395-9155'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '219');

-- FMT | S1 | Matthew Merz
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Matthew Merz', 'FMT | S1 | Matthew Merz', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Wednesday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=163', '163', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68335', false, 'merzhome30@gmail.com', '(940) 703-1399'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '163');

-- FMT | S1 | Steve Barber
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Steve Barber', 'FMT | S1 | Steve Barber', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2913', '2913', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/35705', false, 'Steve.e.barber@gmail.com', '(972) 841-4525', 'Brad Lanham'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2913');

-- FMT | S1 | Tom Dollahite
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Tom Dollahite', 'FMT | S1 | Tom Dollahite', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=200', '200', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/3744', false, 'dollahit@aol.com', '(972) 814-7417'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '200');

-- FMT | S1 | Tony Martinez
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Tony Martinez', 'FMT | S1 | Tony Martinez', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3798', '3798', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/8898', false, 'Tony@WilsonContractorServices.com', '(817) 403-2567'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3798');

-- FMT | S1 | Zack Barger
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Zack Barger', 'FMT | S1 | Zack Barger', 'Flower Mound', 'Hunter Nall', 'active', 'Men''s', 'Wednesday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3831', '3831', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/833', false, 'bargerzack@gmail.com', '(972) 786-1204', '2026-06-10'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3831');

-- FMT | S2 | Amanda Frevert
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Amanda Frevert', 'FMT | S2 | Amanda Frevert', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=257', '257', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/4718', false, 'amandafrevert10@gmail.com', '(281) 799-6654'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '257');

-- FMT | S2 | Anna Reynolds
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Anna Reynolds', 'FMT | S2 | Anna Reynolds', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2323', '2323', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69718', false, 'romena22@gmail.com', '(719) 323-4718'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2323');

-- FMT | S2 | Briana Lanham
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Briana Lanham', 'FMT | S2 | Briana Lanham', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3406', '3406', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/34921', false, 'briana.marie918@gmail.com', '(817) 932-3941'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3406');

-- FMT | S2 | Caleb Chapple
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Caleb Chapple', 'FMT | S2 | Caleb Chapple', 'Flower Mound', 'Esther Perry', 'active', 'YA | Men''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=625', '625', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2437', false, 'caleb.chapple@valleycreek.org', '(817) 307-8997'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '625');

-- FMT | S2 | Carrie Comstock
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Carrie Comstock', 'FMT | S2 | Carrie Comstock', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2300', '2300', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2833', false, 'bradleys.wife@gmail.com', '(972) 948-3510'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2300');

-- FMT | S2 | Chris Pitt
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Chris Pitt', 'FMT | S2 | Chris Pitt', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=236', '236', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80273', false, 'chris.pitt@valleycreek.org', '(940) 395-2591'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '236');

-- FMT | S2 | Christi McCarty
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Christi McCarty', 'FMT | S2 | Christi McCarty', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1132', '1132', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69079', false, 'christimccarty@hotmail.com', '(512) 921-7116'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1132');

-- FMT | S2 | Garrett Heath
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Garrett Heath', 'FMT | S2 | Garrett Heath', 'Flower Mound', 'Esther Perry', 'active', 'YA | Men''s', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=778', '778', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/34835', false, 'garrett.heath@valleycreek.org', '(214) 558-2185'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '778');

-- FMT | S2 | Greg and Tori Atwell
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name, meeting_start_date)
SELECT 'circle', 'Greg Atwell', 'FMT | S2 | Greg and Tori Atwell', 'Flower Mound', 'Esther Perry', 'active', 'Couples', 'Thursday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=244', '244', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/18186', false, 'gatwell13@yahoo.com', '(972) 816-2288', 'Tori Atwell', '2026-06-11'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '244');

-- FMT | S2 | Haley Nall
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Haley Nall', 'FMT | S2 | Haley Nall', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3520', '3520', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/103416', false, 'haleynallart8@gmail.com', '(214) 529-6195'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3520');

-- FMT | S2 | Hunter Nall
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Hunter Nall', 'FMT | S2 | Hunter Nall', 'Flower Mound', 'Esther Perry', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3516', '3516', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/81551', false, 'hunter.nall@valleycreek.org', '(817) 880-5225'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3516');

-- FMT | S2 | Jim and Riley Walker
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Jim Walker', 'FMT | S2 | Jim and Riley Walker', 'Flower Mound', 'Esther Perry', 'active', 'YA | Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2164', '2164', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69569', false, 'jimnealwalker@gmail.com', '(940) 367-4233', 'Riley Walker'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2164');

-- FMT | S2 | John and Jodee Dougherty
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'John Dougherty', 'FMT | S2 | John and Jodee Dougherty', 'Flower Mound', 'Esther Perry', 'active', 'Couples', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3381', '3381', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/84545', false, 'john.dougherty@valleycreek.org', '(215) 353-1832'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3381');

-- FMT | S2 | John Dougherty
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'John Dougherty', 'FMT | S2 | John Dougherty', 'Flower Mound', 'Esther Perry', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=600', '600', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/84545', false, 'john.dougherty@valleycreek.org', '(215) 353-1832'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '600');

-- FMT | S2 | Justin Lanham
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Justin Lanham', 'FMT | S2 | Justin Lanham', 'Flower Mound', 'Esther Perry', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2838', '2838', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/35428', false, 'justin.lanham@valleycreek.org', '(469) 544-4104'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2838');

-- FMT | S2 | Kate Hilsabeck
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Kate Hilsabeck', 'FMT | S2 | Kate Hilsabeck', 'Flower Mound', 'Esther Perry', 'active', 'YA | Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3666', '3666', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/6318', false, 'kate.hilsabeck@valleycreek.org', '(972) 999-7398'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3666');

-- FMT | S2 | Kerry Hillier
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Kerry Hillier', 'FMT | S2 | Kerry Hillier', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Wednesday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=255', '255', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/6310', false, 'kerry_hillier@yahoo.com', '(972) 795-0706', '2026-06-03'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '255');

-- FMT | S2 | Lexie Wood
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Lexie Wood', 'FMT | S2 | Lexie Wood', 'Flower Mound', 'Esther Perry', 'active', 'YA | Women''s', 'Monday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1839', '1839', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/87573', false, 'lexie.wood@valleycreek.org', '(817) 223-6090', '2026-06-01'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1839');

-- FMT | S2 | LoriAnn Gilbert
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'LoriAnn Gilbert', 'FMT | S2 | LoriAnn Gilbert', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3000', '3000', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/87865', false, 'LoriannGilbert@gmail.com', '(925) 482-5090'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3000');

-- FMT | S2 | Mary Lee
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Mary Lee', 'FMT | S2 | Mary Lee', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=271', '271', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/44967', false, 'evmarylee@gmail.com', '(214) 803-6772'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '271');

-- FMT | S2 | Ron and Nancy Spencer
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Nancy Spencer', 'FMT | S2 | Ron and Nancy Spencer', 'Flower Mound', 'Esther Perry', 'active', 'Couples', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=265', '265', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/50605', false, 'nancy.spencer@valleycreek.org', '(214) 697-4758'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '265');

-- FMT | S2 | Rose Corbett
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Rosemary Corbett', 'FMT | S2 | Rose Corbett', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2420', '2420', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/2919', false, 'rose@christianrep.com', '(603) 560-8006'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2420');

-- FMT | S2 | Wendy Earley
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Wendy Earley', 'FMT | S2 | Wendy Earley', 'Flower Mound', 'Esther Perry', 'active', 'Women''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=274', '274', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/3965', false, 'wendy.earley@verizon.net', '(214) 793-4916'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '274');

-- FMT | S2 | Zach Welch
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Zach Welch', 'FMT | S2 | Zach Welch', 'Flower Mound', 'Esther Perry', 'active', 'YA | Men''s', 'Tuesday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1613', '1613', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/79008', false, 'zach.welch@valleycreek.org', '(214) 770-5358', '2026-06-02'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1613');

-- FMT | S3 | Ally Salls
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Ally Salls', 'FMT | S3 | Ally Salls', 'Flower Mound', 'Chris Pitt', 'active', 'YA | Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=714', '714', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/78917', false, 'ally.salls@valleycreek.org', '(214) 417-1544'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '714');

-- FMT | S3 | Amy Duininck
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Amy Duininck', 'FMT | S3 | Amy Duininck', 'Flower Mound', 'Chris Pitt', 'active', 'Women''s', 'Tuesday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=295', '295', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/3879', false, 'Amy.Duininck@icloud.com', '(817) 223-7699', '2026-06-02'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '295');

-- FMT | S3 | Ben Moreno
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Ben Moreno', 'FMT | S3 | Ben Moreno', 'Flower Mound', 'Chris Pitt', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1866', '1866', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9890', false, 'ben.moreno@valleycreek.org', '(214) 725-4965'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1866');

-- FMT | S3 | Chad and Esther Perry
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Esther Perry', 'FMT | S3 | Chad and Esther Perry', 'Flower Mound', 'Chris Pitt', 'active', 'Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2834', '2834', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/24834', false, 'esther.perry@valleycreek.org', '(469) 740-0067'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2834');

-- FMT | S3 | Chris and Tracey Kozen
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name, meeting_start_date)
SELECT 'circle', 'Chris Kozen', 'FMT | S3 | Chris and Tracey Kozen', 'Flower Mound', 'Chris Pitt', 'active', 'Couples', 'Sunday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=300', '300', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/32058', false, 'chris.kozen@valleycreek.org', '(940) 395-4700', 'Tracey Kozen', '2026-06-07'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '300');

-- FMT | S3 | Dave and Nicole Scriven
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'David Scriven', 'FMT | S3 | Dave and Nicole Scriven', 'Flower Mound', 'Chris Pitt', 'active', 'Couples', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2347', '2347', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12690', false, 'david.scriven@valleycreek.org', '(916) 605-6808', 'Nicole Scriven'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2347');

-- FMT | S3 | David Huntley
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'David Huntley', 'FMT | S3 | David Huntley', 'Flower Mound', 'Chris Pitt', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=206', '206', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80271', false, 'david.huntley@valleycreek.org', '(940) 808-9529'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '206');

-- FMT | S3 | Heather Mungeer
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Heather Mungeer', 'FMT | S3 | Heather Mungeer', 'Flower Mound', 'Chris Pitt', 'active', 'YA | Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1151', '1151', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69581', false, 'heather.mungeer@valleycreek.org', '(646) 732-9273'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1151');

-- FMT | S3 | Jason Hillier
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jason Hillier', 'FMT | S3 | Jason Hillier', 'Flower Mound', 'Chris Pitt', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=211', '211', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/72220', false, 'jason.hillier@valleycreek.org', '(972) 906-9247'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '211');

-- FMT | S3 | Josh and Kristi Robinson
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Joshua Robinson', 'FMT | S3 | Josh and Kristi Robinson', 'Flower Mound', 'Chris Pitt', 'active', 'Couples', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3383', '3383', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/22611', false, 'jrobinsonaggie@gmail.com', '(979) 324-5674'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3383');

-- FMT | S3 | Kirk and Kristina Williams
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name, meeting_start_date)
SELECT 'circle', 'Kristina Williams', 'FMT | S3 | Kirk and Kristina Williams', 'Flower Mound', 'Chris Pitt', 'active', 'Couples', 'Tuesday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1754', '1754', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/66020', false, 'kristina.renee2014@gmail.com', '(540) 760-4324', 'Kirk Williams', '2026-06-09'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1754');

-- FMT | S3 | Lauren Boyes
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Lauren Boyes', 'FMT | S3 | Lauren Boyes', 'Flower Mound', 'Chris Pitt', 'active', 'YA | Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2319', '2319', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80284', false, 'Lauren.Boyes@valleycreek.org', '(713) 557-4771'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2319');

-- FMT | S3 | Mary Wallace
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Mary Wallace', 'FMT | S3 | Mary Wallace', 'Flower Mound', 'Chris Pitt', 'active', 'Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2914', '2914', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/89494', false, 'Cuteladywallace@gmail.com', '(541) 661-4565'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2914');

-- FMT | S3 | Michelle Edwards
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Michelle Edwards', 'FMT | S3 | Michelle Edwards', 'Flower Mound', 'Chris Pitt', 'active', 'Women''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3433', '3433', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74076', false, 'michannliv@gmail.com', '(214) 683-7296'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3433');

-- FMT | S3 | Rebekah Baus
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Rebekah Baus', 'FMT | S3 | Rebekah Baus', 'Flower Mound', 'Chris Pitt', 'active', 'Women''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3899', '3899', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/15685', false, 'rebekahbaus@gmail.com', '(972) 979-9524'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3899');

-- FMT | S3 | Richard and Jennifer Siler
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Richard Siler', 'FMT | S3 | Richard and Jennifer Siler', 'Flower Mound', 'Chris Pitt', 'active', 'Couples', 'Friday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3007', '3007', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/13022', false, 'janddsiler@gmail.com', '(817) 403-5368'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3007');

-- FMT | S3 | Riley Adams
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Riley Adams', 'FMT | S3 | Riley Adams', 'Flower Mound', 'Chris Pitt', 'active', 'YA | Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3091', '3091', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/22283', false, 'riley.adams@valleycreek.org', '(972) 251-9520'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3091');

-- FMT | S3 | Ryan and Allison Greenawalt
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Allison Greenawalt', 'FMT | S3 | Ryan and Allison Greenawalt', 'Flower Mound', 'Chris Pitt', 'active', 'YA | Coed', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=316', '316', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/7015', false, 'allisonggreenawalt@gmail.com', '(214) 529-9373', 'Ryan Greenawalt'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '316');

-- FMT | S3 | Sarah Heath
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Sarah Heath', 'FMT | S3 | Sarah Heath', 'Flower Mound', 'Chris Pitt', 'active', 'Women''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2839', '2839', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/26770', false, 'sarah.heath@valleycreek.org', '(972) 965-5360'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2839');

-- FMT | S3 | Sarah Henninger
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Sarah Henninger', 'FMT | S3 | Sarah Henninger', 'Flower Mound', 'Chris Pitt', 'active', 'YA | Women''s', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=287', '287', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74946', false, 'henningersarah518@gmail.com', '(469) 993-5829'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '287');

-- FMT | S3 | Sebastian Mancillas
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Sebastian Mancillas', 'FMT | S3 | Sebastian Mancillas', 'Flower Mound', 'Chris Pitt', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3436', '3436', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/70552', false, 'sebastian.mancillas@valleycreek.org', '(682) 438-0327'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3436');

-- FMT | S3 | Terra Klarich
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Terra Klarich', 'FMT | S3 | Terra Klarich', 'Flower Mound', 'Chris Pitt', 'active', 'Women''s', 'Thursday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=708', '708', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/78667', false, 'Faktsm@aol.com', '(425) 830-8152', '2026-06-04'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '708');

-- FMT | S3 | Tony and Kriston Ciaccio
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Tony Ciaccio', 'FMT | S3 | Tony and Kriston Ciaccio', 'Flower Mound', 'Chris Pitt', 'active', 'Couples', 'Sunday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3663', '3663', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/42550', false, 'tony.ciaccio@gmx.com', '(214) 334-4720', '2026-06-07'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3663');

-- FMT | S3 | Whittney Helvey
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Whittney Helvey', 'FMT | S3 | Whittney Helvey', 'Flower Mound', 'Chris Pitt', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1257', '1257', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88240', false, 'losh.whittney@yahoo.com', '(972) 890-4593'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1257');

-- GVT | S1 | Blake Howard
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Blake Howard', 'GVT | S1 | Blake Howard', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Saturday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=158', '158', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/77971', false, 'rbhoward07@yahoo.com', '(469) 865-8130', 'Joe Monden'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '158');

-- GVT | S1 | Bret Moore
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Bret Moore', 'GVT | S1 | Bret Moore', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Monday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=744', '744', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/84440', false, 'bretmoore82@gmail.com', '(940) 727-4520'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '744');

-- GVT | S1 | Brian Schoenhofer
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Brian Schoenhofer', 'GVT | S1 | Brian Schoenhofer', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=506', '506', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80127', false, 'brian.schoenhofer@valleycreek.org', '(940) 395-2160'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '506');

-- GVT | S1 | Bruce Birdsong
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name, meeting_start_date)
SELECT 'circle', 'Bruce Birdsong', 'GVT | S1 | Bruce Birdsong', 'Gainesville', 'Brian Schoenhofer', 'active', 'Couples', 'Thursday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1848', '1848', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68566', false, 'bruce@tejasranch.com', '(214) 957-3361', 'Sheree Birdsong', '2026-06-11'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1848');

-- GVT | S1 | Carla Rolinc
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Carla Rolinc', 'GVT | S1 | Carla Rolinc', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Wednesday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3008', '3008', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/93212', false, 'crolinc@gmail.com', '(214) 223-4807'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3008');

-- GVT | S1 | Carrie Grebliunas
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Carrie Grebliunas', 'GVT | S1 | Carrie Grebliunas', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Thursday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2846', '2846', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/29889', false, 'carriegrebliunas@gmail.com', '(940) 641-1153'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2846');

-- GVT | S1 | Chad Gregg
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Chad Gregg', 'GVT | S1 | Chad Gregg', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2604', '2604', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/71260', false, 'Chad@enderbygas.com', '(940) 736-3490'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2604');

-- GVT | S1 | Chris Root
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Chris Root', 'GVT | S1 | Chris Root', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Monday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1572', '1572', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12106', false, 'rroost@ntin.net', '(940) 736-9928'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1572');

-- GVT | S1 | Christian Kaprelian
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Christian Kaprelian', 'GVT | S1 | Christian Kaprelian', 'Gainesville', 'Brian Schoenhofer', 'active', 'YA | Men''s', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=507', '507', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/42698', false, 'ckaprelian@gmail.com', '(469) 968-7245'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '507');

-- GVT | S1 | Dakota Artiaga
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Dakota Artiaga', 'GVT | S1 | Dakota Artiaga', 'Gainesville', 'Brian Schoenhofer', 'active', 'YA | Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3679', '3679', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/94568', false, 'artiagadakota06@gmail.com', '(940) 612-9262'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3679');

-- GVT | S1 | Dylan Lewis
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Dylan Lewis', 'GVT | S1 | Dylan Lewis', 'Gainesville', 'Brian Schoenhofer', 'active', 'YA | Men''s', 'Tuesday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3680', '3680', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92128', false, 'Lewisdylan042399@gmail.com', '(417) 312-7798'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3680');

-- GVT | S1 | Emily Saller
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Emily Saller', 'GVT | S1 | Emily Saller', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Wednesday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1847', '1847', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/91297', false, 'EMILY@DLFARMHOME.COM', '(940) 390-0466'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1847');

-- GVT | S1 | Emily Scheer
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Emily Scheer', 'GVT | S1 | Emily Scheer', 'Gainesville', 'Brian Schoenhofer', 'active', 'YA | Women''s', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3221', '3221', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/87175', false, 'emscheer4@gmail.com', '(573) 999-7024'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3221');

-- GVT | S1 | Eric Erlandson
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Eric Erlandson', 'GVT | S1 | Eric Erlandson', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Tuesday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3734', '3734', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/70538', false, 'eric.erlandson@gmail.com', '(940) 736-1549'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3734');

-- GVT | S1 | Eric Shutt
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Stephanie Shutt', 'GVT | S1 | Eric Shutt', 'Gainesville', 'Brian Schoenhofer', 'active', 'Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1404', '1404', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12982', false, 'stephanielshutt@gmail.com', '(940) 977-9500', 'Eric Shutt'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1404');

-- GVT | S1 | Grant Webb
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Grant Webb', 'GVT | S1 | Grant Webb', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3681', '3681', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92364', false, 'grantw_lvn@yahoo.com', '(940) 736-4031'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3681');

-- GVT | S1 | Jay Borowy
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Jay Borowy', 'GVT | S1 | Jay Borowy', 'Gainesville', 'Brian Schoenhofer', 'active', 'Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=154', '154', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/72253', false, 'borowyjay@gmail.com', '(940) 703-9091', 'Carly Borowy'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '154');

-- GVT | S1 | Joe Monden
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Joe Monden', 'GVT | S1 | Joe Monden', 'Gainesville', 'Brian Schoenhofer', 'active', 'Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=155', '155', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9777', false, 'jmracecars@yahoo.com', '(940) 727-3655', 'Lynn Monden'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '155');

-- GVT | S1 | Joel Lewis
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'Christy Lewis', 'GVT | S1 | Joel Lewis', 'Gainesville', 'Brian Schoenhofer', 'active', 'Couples', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=748', '748', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/23811', false, 'jewel4jesus2001@yahoo.com', '(940) 390-6671', 'Joel Lewis'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '748');

-- GVT | S1 | Justin Day
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Justin Day', 'GVT | S1 | Justin Day', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Sunday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2602', '2602', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/73913', false, 'Justintday13@gmail.com', '(940) 443-0587'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2602');

-- GVT | S1 | Katie Kaprelian
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Katie Kaprelian', 'GVT | S1 | Katie Kaprelian', 'Gainesville', 'Brian Schoenhofer', 'active', 'YA | Women''s', 'Sunday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2732', '2732', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/42699', false, 'katie.kaprelian@valleycreek.org', '(469) 968-7788', '2026-06-14'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2732');

-- GVT | S1 | Kaye Campbell
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Kaye Campbell', 'GVT | S1 | Kaye Campbell', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1489', '1489', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/57417', false, 'Cunina@sbcglobal.net', '(940) 736-6575'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1489');

-- GVT | S1 | Laura Johnston
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Laura Johnston', 'GVT | S1 | Laura Johnston', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Thursday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3540', '3540', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/64421', false, 'llh.johnston@gmail.com', '(979) 848-6757'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3540');

-- GVT | S1 | Laurie Tjosvold
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Laurie Tjosvold', 'GVT | S1 | Laurie Tjosvold', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Monday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1245', '1245', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/14287', false, 'ltjosvold@yahoo.com', '(214) 226-0519'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1245');

-- GVT | S1 | Manny Roman
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Manny Roman', 'GVT | S1 | Manny Roman', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Saturday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3222', '3222', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/90596', false, 'emanuelroman@live.com', '(469) 688-1261'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3222');

-- GVT | S1 | Matt Grebliunas
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Matt Grebliunas', 'GVT | S1 | Matt Grebliunas', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3736', '3736', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/29888', false, 'mattgrebliunas@gmail.com', '(903) 520-0536'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3736');

-- GVT | S1 | Matt Saller
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Matt Saller', 'GVT | S1 | Matt Saller', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3371', '3371', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/91298', false, 'matt@dlfarmhome.com', '(214) 714-7749'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3371');

-- GVT | S1 | Mike Browne
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Mike Browne', 'GVT | S1 | Mike Browne', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1849', '1849', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/85371', false, 'Mikebrowne76@gmail.com', '(810) 836-5830'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1849');

-- GVT | S1 | Nick Ponomarenko
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Nicholas Ponomarenko', 'GVT | S1 | Nick Ponomarenko', 'Gainesville', 'Brian Schoenhofer', 'active', 'Couples', 'Wednesday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=575', '575', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/68699', false, 'napono56@gmail.com', '(559) 301-4256'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '575');

-- GVT | S1 | Stephanie Schoenhofer
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Stephanie Schoenhofer', 'GVT | S1 | Stephanie Schoenhofer', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Tuesday', NULL, 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=580', '580', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75337', false, 'Sshow3@hotmail.com', '(316) 259-8427'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '580');

-- GVT | S1 | Taylor Day
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Taylor Day', 'GVT | S1 | Taylor Day', 'Gainesville', 'Brian Schoenhofer', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2601', '2601', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/75984', false, 'taylor.day@valleycreek.org', '(940) 923-9254'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2601');

-- GVT | S1 | Tony Dominguez
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Tony Dominguez', 'GVT | S1 | Tony Dominguez', 'Gainesville', 'Brian Schoenhofer', 'active', 'Men''s', 'Tuesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3180', '3180', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/81657', false, 'Tobyd0844@gmail.com', '(469) 381-6922'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3180');

-- LVT | S1 | Amanda Duke
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Amanda Duke', 'LVT | S1 | Amanda Duke', 'Lewisville', 'Trip Ochenski', 'active', 'YA | Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3143', '3143', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/35397', false, 'dukeam@ymail.com', '(316) 250-2081'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3143');

-- LVT | S1 | Amy Ferrera
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Amy Ferrara', 'LVT | S1 | Amy Ferrera', 'Lewisville', 'Trip Ochenski', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3415', '3415', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/53868', false, 'anderson_amy76@yahoo.com', '(972) 342-7490'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3415');

-- LVT | S1 | Bryce Hamilton
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Bryce Hamilton', 'LVT | S1 | Bryce Hamilton', 'Lewisville', 'Trip Ochenski', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2255', '2255', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/97036', false, 'bryce.hamilton90@gmail.com', '(817) 995-9822'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2255');

-- LVT | S1 | Carl and Karin Smith
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name, meeting_start_date)
SELECT 'circle', 'Carl Smith', 'LVT | S1 | Carl and Karin Smith', 'Lewisville', 'Trip Ochenski', 'active', 'Couples', 'Sunday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=775', '775', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/79248', false, 'skeeziks3@charter.net', '(940) 205-0970', 'Karin Smith', '2026-06-14'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '775');

-- LVT | S1 | Charles and Nancy Pierce
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name, meeting_start_date)
SELECT 'circle', 'Charles Pierce', 'LVT | S1 | Charles and Nancy Pierce', 'Lewisville', 'Trip Ochenski', 'active', 'Couples', 'Thursday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1475', '1475', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/71695', false, 'Cpierce11@tx.rr.com', '(469) 744-7380', 'Nancy Pierce', '2026-06-04'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1475');

-- LVT | S1 | Colton Nicholas
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Colton Nicholas', 'LVT | S1 | Colton Nicholas', 'Lewisville', 'Trip Ochenski', 'active', 'YA | Men''s', 'Monday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1072', '1072', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/80957', false, 'colton.nicholas@icloud.com', '(512) 221-3232'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1072');

-- LVT | S1 | Cris Murray
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Cris Murray', 'LVT | S1 | Cris Murray', 'Lewisville', 'Trip Ochenski', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=162', '162', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/34371', false, 'getacar04@yahoo.com', '(214) 566-9461'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '162');

-- LVT | S1 | Jeff Woods
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Jeff Woods', 'LVT | S1 | Jeff Woods', 'Lewisville', 'Trip Ochenski', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2139', '2139', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/79235', false, 'jtwoods0817@gmail.com', '(972) 849-1468'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2139');

-- LVT | S1 | Jimmy & Kim McAfee
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Jimmy McAfee', 'LVT | S1 | Jimmy & Kim McAfee', 'Lewisville', 'Trip Ochenski', 'active', 'Couples', 'Wednesday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3134', '3134', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9064', false, 'jimmy.mcafee1@gmail.com', '(214) 206-6490', '2026-06-11'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3134');

-- LVT | S1 | Laura Impey
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Laura Impey', 'LVT | S1 | Laura Impey', 'Lewisville', 'Trip Ochenski', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2108', '2108', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/48435', false, 'Lauraeimpey@gmail.com', '(571) 447-3576'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2108');

-- LVT | S1 | Lottie Bernecker
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Lottie Bernecker', 'LVT | S1 | Lottie Bernecker', 'Lewisville', 'Trip Ochenski', 'active', 'Women''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3233', '3233', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/69937', false, 'Llynk3@gmail.com', '(715) 458-6558'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3233');

-- LVT | S1 | Mina Wynn
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, meeting_start_date)
SELECT 'circle', 'Mina Wynn', 'LVT | S1 | Mina Wynn', 'Lewisville', 'Trip Ochenski', 'active', 'Women''s', 'Sunday', 'Bi-weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=330', '330', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/74338', false, 'm.wynn60@yahoo.com', '(940) 268-8500', '2026-06-07'::date
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '330');

-- LVT | S1 | Patt Bowles
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Patt Bowles', 'LVT | S1 | Patt Bowles', 'Lewisville', 'Trip Ochenski', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=859', '859', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/58292', false, 'lonestarpatt@gmail.com', '(214) 533-4474'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '859');

-- LVT | S1 | Rob Shields
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Robert Shields', 'LVT | S1 | Rob Shields', 'Lewisville', 'Trip Ochenski', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1118', '1118', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/12912', false, 'robert.shields@valleycreek.org', '(214) 425-5905'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1118');

-- LVT | S1 | Tara Meche
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Tara Meche', 'LVT | S1 | Tara Meche', 'Lewisville', 'Trip Ochenski', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3212', '3212', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/22715', false, 'tara.meche01@gmail.com', '(972) 829-5499'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3212');

-- LVT | S1 | Todd Baden
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Todd Baden', 'LVT | S1 | Todd Baden', 'Lewisville', 'Trip Ochenski', 'active', 'Men''s', 'Friday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=324', '324', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/1', false, 'todd.baden@valleycreek.org', '(972) 210-9468'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '324');

-- LVT | S1 | Trip Ochenski
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Trip Ochenski', 'LVT | S1 | Trip Ochenski', 'Lewisville', 'Trip Ochenski', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3682', '3682', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/9', false, 'trip.ochenski@valleycreek.org', '(972) 467-5988'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3682');

-- ONL | S1 | April Maynard
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'April Maynard', 'ONL | S1 | April Maynard', 'Online', 'Taylor Cole', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=3389', '3389', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/70776', false, 'amajldm@msn.com', '(907) 687-6781'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '3389');

-- ONL | S1 | John and Marylou Cash
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone, additional_leader_name)
SELECT 'circle', 'John Cash', 'ONL | S1 | John and Marylou Cash', 'Online', 'Taylor Cole', 'active', 'Couples', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=711', '711', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/66163', false, 'johnacash@verizon.net', '(817) 501-3618', 'Marylou Cash'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '711');

-- ONL | S1 | John Stickl Sr.
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'John Stickl', 'ONL | S1 | John Stickl Sr.', 'Online', 'Taylor Cole', 'active', 'Men''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=1330', '1330', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/13711', false, 'jwstickl@gmail.com', '(716) 907-7344'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '1330');

-- ONL | S1 | Laurie Shea
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Laurie Shea', 'ONL | S1 | Laurie Shea', 'Online', 'Taylor Cole', 'active', 'Women''s', 'Thursday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=2110', '2110', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/88482', false, 'lawlaur915@gmail.com', '(540) 295-2420'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '2110');

-- ONL | S1 | Lynn Roush
INSERT INTO circle_leaders (leader_type, name, circle_name, campus, acpd, status, circle_type, day, frequency, ccb_profile_link, ccb_group_id, leader_ccb_profile_link, event_summary_received, email, phone)
SELECT 'circle', 'Lynn Roush', 'ONL | S1 | Lynn Roush', 'Online', 'Taylor Cole', 'active', 'Men''s', 'Wednesday', 'Weekly', 'https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=145', '145', 'https://valleycreekchurch.ccbchurch.com/goto/individuals/92254', false, 'ljroush714@gmail.com', '(301) 661-4411'
WHERE NOT EXISTS (SELECT 1 FROM circle_leaders WHERE ccb_group_id = '145');

COMMIT;