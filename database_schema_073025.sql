-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.acpd_list (
  id integer NOT NULL DEFAULT nextval('acpd_list_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  description text,
  CONSTRAINT acpd_list_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campus_list (
  id integer NOT NULL DEFAULT nextval('campus_list_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  address text,
  CONSTRAINT campus_list_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campuses (
  id integer NOT NULL DEFAULT nextval('campuses_id_seq'::regclass),
  value text NOT NULL,
  CONSTRAINT campuses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.circle_leaders (
  id integer NOT NULL DEFAULT nextval('circle_leaders_id_seq'::regclass),
  name text NOT NULL,
  email text,
  phone text,
  campus text,
  acpd text,
  circle_type text,
  day text,
  time text,
  frequency text,
  meeting_start_date date,
  ccb_profile_link text,
  status text CHECK (status = ANY (ARRAY['invited'::text, 'pipeline'::text, 'active'::text, 'paused'::text, 'off-boarding'::text])),
  follow_up_date date,
  follow_up_note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  event_summary_received boolean DEFAULT false,
  uuid uuid DEFAULT gen_random_uuid() UNIQUE,
  ccb_group_id text,
  follow_up_required boolean DEFAULT false,
  CONSTRAINT circle_leaders_pkey PRIMARY KEY (id)
);
CREATE TABLE public.circle_types (
  id integer NOT NULL DEFAULT nextval('circle_types_id_seq'::regclass),
  value text NOT NULL,
  CONSTRAINT circle_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.circle_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  leader_id integer NOT NULL,
  visit_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'::text CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'canceled'::text])),
  scheduled_by text NOT NULL,
  scheduled_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  completed_by text,
  canceled_at timestamp with time zone,
  canceled_by text,
  cancel_reason text,
  previsit_note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT circle_visits_pkey PRIMARY KEY (id),
  CONSTRAINT circle_visits_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.circle_leaders(id)
);
CREATE TABLE public.communications (
  id integer NOT NULL DEFAULT nextval('communications_id_seq'::regclass),
  circle_leader_id integer,
  user_id uuid,
  type USER-DEFINED NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  communication_date date DEFAULT CURRENT_DATE,
  CONSTRAINT communications_pkey PRIMARY KEY (id),
  CONSTRAINT communications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.connection_types (
  id integer NOT NULL DEFAULT nextval('connection_types_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  description text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT connection_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.connections (
  id integer NOT NULL DEFAULT nextval('connections_id_seq'::regclass),
  circle_leader_id integer NOT NULL,
  connection_type_id integer NOT NULL,
  date_of_connection date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  created_by character varying DEFAULT 'System'::character varying,
  CONSTRAINT connections_pkey PRIMARY KEY (id),
  CONSTRAINT connections_circle_leader_id_fkey FOREIGN KEY (circle_leader_id) REFERENCES public.circle_leaders(id),
  CONSTRAINT connections_connection_type_id_fkey FOREIGN KEY (connection_type_id) REFERENCES public.connection_types(id)
);
CREATE TABLE public.frequencies (
  id integer NOT NULL DEFAULT nextval('frequencies_id_seq'::regclass),
  value text NOT NULL,
  CONSTRAINT frequencies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notes (
  id integer NOT NULL DEFAULT nextval('notes_id_seq'::regclass),
  circle_leader_id integer,
  user_id uuid,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  note_date date,
  note text,
  follow_up_date date,
  created_by uuid,
  CONSTRAINT notes_pkey PRIMARY KEY (id),
  CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT notes_circle_leader_id_fkey FOREIGN KEY (circle_leader_id) REFERENCES public.circle_leaders(id)
);
CREATE TABLE public.statuses (
  id integer NOT NULL DEFAULT nextval('statuses_id_seq'::regclass),
  value text NOT NULL,
  CONSTRAINT statuses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_notes (
  id integer NOT NULL DEFAULT nextval('user_notes_id_seq'::regclass),
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pinned boolean DEFAULT false,
  CONSTRAINT user_notes_pkey PRIMARY KEY (id),
  CONSTRAINT user_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'Viewer'::user_role CHECK (role = ANY (ARRAY['ACPD'::user_role, 'Viewer'::user_role])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  campus text,
  acpd text,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);