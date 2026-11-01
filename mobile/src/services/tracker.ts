import { createTrackerApi } from '@habit-tracker/core';
import { supabase } from './supabase';

export const tracker = createTrackerApi(supabase);
