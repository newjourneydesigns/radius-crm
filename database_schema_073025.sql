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
  ccb_profile_link text,
  status text CHECK (status = ANY (ARRAY['invited'::text, 'pipeline'::text, 'active'::text, 'paused'::text, 'off-boarding'::text])),
  follow_up_date date,
  follow_up_note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  event_summary_received boolean DEFAULT false,
  uuid uuid DEFAULT gen_random_uuid() UNIQUE,
  CONSTRAINT circle_leaders_pkey PRIMARY KEY (id)
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
  CONSTRAINT notes_circle_leader_id_fkey FOREIGN KEY (circle_leader_id) REFERENCES public.circle_leaders(id),
  CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
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