/* rule.ts: who may submit, said the same way everywhere. Be on your city's list with the
   email you used on Luma, then type the code on the screen in the room. Anyone may vote after confirming an email.
   The emails, the line under a city's header, Get ready, the submit sheet, the editor server and every refusal read
   from here, so the words cannot drift apart. */

export const HOW_TO_SUBMIT = 'To submit, be on your city’s list with the email you used on Luma, then type the code on the screen in the room.';

/* the same two steps, for one city */
export const howIn = (city: string) => 'To submit, be on the list for ' + city + ' with the email you used on Luma, then type the code on the screen in the room.';

/* refusals */
export const notListed = (city: string) => 'You are not on the list for ' + city + ', so you can vote but not submit. To submit, ask the host at the desk to add the email you used on Luma, then type the code on the screen in the room.';
export const notListedAnywhere = 'You are not on a city’s list, so you can vote but not submit. To submit, ask the host at the desk to add the email you used on Luma, then type the code on the screen in the room.';
export const notInRoom = (city: string) => 'You are on the list for ' + city + '. To submit, type the code on the screen in the room.';
export const roomNotListed = (email: string, city: string) => email + ' is not on the list for ' + city + '. Ask the host at the desk to add you. You can still vote.';
export const otherCity = (mine: string, here: string) => 'You are on the list for ' + mine + ', not ' + here + '. Type the code on the screen in the ' + mine + ' room.';
export const wrongCode = (city: string) => 'That code is not the one on the screen in ' + city + '. Check it and try again.';

/* for someone already on a list (the email with their link, the line under their city's header) */
export const ON_LIST_NEXT = 'To submit on the day, type the code on the screen in the room with this email.';
export const IN_ROOM_NEXT = 'To submit, type the code on the screen in the room.';
/* the submit sheet's code step (its heading already says "Type the code on the screen") */
export const roomStep = (city: string) => 'You are on the list for ' + city + '. The code is the four letters and numbers beside the QR, and you type it once.';
export const ROOM_NOT_SAVED = 'Your entry is not saved yet. Check in first; what you typed is kept.';
export const ROOM_HOST = 'Not in the room, or the code does not work? The host at the desk can check you in.';
/* for the editor: the server asks for the code once */
export const EDITOR_ROOM = 'On the day, your editor asks for the code on the screen in the room once, before it submits.';

/* the room code itself: four letters and numbers */
export const roomCodeOK = (c: string) => /^[A-Za-z0-9]{4}$/.test(c.trim());
