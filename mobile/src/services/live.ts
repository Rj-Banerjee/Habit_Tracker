import { watchActivity } from '@habit-tracker/core';
import { supabase } from './supabase';

export const watchMyActivity = (onChange: () => void) => watchActivity(supabase, onChange);
