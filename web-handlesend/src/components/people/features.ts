import { AtSign, BadgeCheck, Box, Briefcase, Camera, Fingerprint, Flag, Handshake, Image, Layers, MapPin, Megaphone, Newspaper, PiggyBank, Radio, ScanFace, Split, Target, UserPlus, Users, Vote, type LucideIcon } from 'lucide-react';

/** Plain-language names for each server feature id. State always comes from the server registry. */
export const FRIENDLY: Record<string, { title: string; line: string; icon: LucideIcon }> = {
  self_launch: { title: 'Make your own profile', line: 'Private draft that saves as you go.', icon: ScanFace },
  assisted: { title: 'Invite someone you work with', line: 'You prep it, they accept and take control.', icon: UserPlus },
  nominations: { title: 'Nominate a creator', line: 'Suggest who should be on People next.', icon: Megaphone },
  capture: { title: 'Selfie & body capture', line: 'Guided photos with light and focus checks.', icon: Camera },
  model_jobs: { title: 'Your 3D double', line: 'AI builds a 3D you. You approve it first.', icon: Box },
  proofs: { title: 'Verified badges', line: 'Each badge says exactly what was checked.', icon: BadgeCheck },
  canonical: { title: 'One official profile per person', line: 'Copycats go to review, not to market.', icon: Fingerprint },
  fee_split: { title: 'Your fee split', line: 'You sign who gets what, before launch.', icon: Split },
  public_profile: { title: 'Public profile page', line: '3D viewer, links and proof, all in one.', icon: AtSign },
  moderation: { title: 'Report, withdraw, delete', line: 'Take it down or delete it any time.', icon: Flag },
  timeline: { title: 'Official timeline', line: 'Your posts, straight from the source.', icon: Newspaper },
  live: { title: 'Go live', line: 'Link your stream to your profile.', icon: Radio },
  missions: { title: 'Paid missions', line: 'Fans fund a task, you accept, you get paid.', icon: Target },
  sponsorships: { title: 'Sponsorships', line: 'Brand deals with clear labels.', icon: Handshake },
  applications: { title: 'Creator jobs', line: 'Apply for paid roles, remote or in SF.', icon: Briefcase },
  milestones: { title: 'Milestone funding', line: 'Fund gear and projects in public.', icon: PiggyBank },
  votes: { title: 'Community votes', line: 'Holders vote on options you choose.', icon: Vote },
  collectibles: { title: 'Avatar collectibles', line: 'License your look on your terms.', icon: Image },
  checkins: { title: 'Check-ins', line: 'Show you’re active, when you choose.', icon: MapPin },
  collectives: { title: 'Creator collectives', line: 'Team up in one basket.', icon: Layers },
};
export const FALLBACK_ICON = Users;

export const PEOPLE_X_POST = 'Building ObjectPad People in public.\n\nWorking tonight:\n• Private profile drafts that save as you go\n• Guided selfie capture with light, focus and one-person checks\n• Your private 3D double, built by AI, approved by you\n• X account + wallet proof\n• Sign your own fee split\n• Nominate creators, apply for creator roles\n\nStill locked: liveness verification and launches. No coin goes live until those pass.\n\nWatch it build: objectpad.fun/People';
export const shareOnX = (text: string): string => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
