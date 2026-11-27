/* rule.ts: who may submit, said the same way everywhere. Sign in with your Supabase account, be on your city's list
   (from Luma, with this email or one you add), and a host checks you in at the door on the day. Anyone may vote once
   signed in. The line under a city's header, Get ready, the submit sheet, the editor server and every refusal read
   from here, so the words cannot drift apart. */

export const HOW_TO_SUBMIT = 'To submit, sign in with your Supabase account, be on your city’s list from Luma, and get checked in by a host at the door.';

/* refusals */
export const notListed = (city: string) => 'You are not on the list for ' + city + ', so you can vote but not submit. Registered on Luma with another email? Add it in your account. Otherwise ask a host at the door.';
export const notListedAnywhere = 'You are not on a city’s list, so you can vote but not submit. Registered on Luma with another email? Add it in your account. Otherwise ask a host at the door.';
export const notInRoom = (city: string) => 'You are on the list for ' + city + '. To submit, ask a host at the door to check you in.';

/* for someone already on a list (the line under their city's header, the account sheet) */
export const IN_ROOM_NEXT = 'Checked in: you can submit.';
/* the submit sheet when the person is not checked in yet */
export const checkInStep = (city: string) => 'You are on the list for ' + city + '. A host at the door checks you in, then Submit opens here.';
export const NOT_SAVED = 'Your entry is not saved yet. What you typed is kept here until you are checked in.';
/* for the editor */
export const EDITOR_ROOM = 'On the day, a host checks you in at the door; after that your editor can submit.';

/* the email sign-in, when its switch is off */
export const EMAIL_OFF = 'Sign in with your Supabase account.';
