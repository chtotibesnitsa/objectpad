import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, API_BASE, RequestError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { CHECK_LABELS, VIEW_GUIDE, type CaptureMode, type CaptureView, type CheckId, type FeeSplit, type ModelJobView, type PeopleStatus, type Relationship } from '@/shared/people';

export type DraftState = 'draft' | 'awaiting_subject' | 'published' | 'withdrawn' | 'deleted';
/** One verification check, evaluated server-side from stored evidence. */
export interface DraftCheck { id: CheckId; label: string; passed: boolean; at: number | null; }
/** A private People draft as its creator or subject sees it. */
export interface PeopleDraft {
  id: string; relationship: Relationship; role: 'creator' | 'subject' | 'both'; state: DraftState;
  displayName: string; narrative: string; captureMode: CaptureMode; version: number; split: FeeSplit; maxLauncherBps: number;
  subjectAccepted: boolean; canEdit: boolean; checks: DraftCheck[];
  account: { provider: 'x'; handle: string; boundAt: number } | null;
  wallet: { address: string; boundAt: number } | null;
  invitation: { state: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'; expiresAt: number; createdAt: number } | null;
  feePolicy: { version: number; subjectBps: number; launcherBps: number; platformBps: number; subjectWallet: string; launcherWallet: string | null; signedAt: number } | null;
  liveness: { providerConfigured: boolean; state: string };
  profileId: string | null; createdAt: number; updatedAt: number;
}
export interface InvitePreview { state: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'; expiresAt: number; displayName: string; invitedBy: string; launcherBps: number; scope: string[]; }
export interface PeoplePhoto { view: CaptureView; width: number; height: number; createdAt: number; }
export interface ModelStatus { job: ModelJobView | null; attemptsLeft: number; configured: boolean; }
export interface PublicPerson { profileId: string; displayName: string; narrative: string; relationship: Relationship; handle: string | null; wallet: string | null; split: FeeSplit; hasModel?: boolean; checks: DraftCheck[]; attestation: { manifest: Record<string, unknown>; digest: string; revoked: boolean } | null; }

export const PEOPLE_KEY = ['objectpad', 'people'] as const;

/** Server-configured People status registry: phase, per-feature Planned/Pilot/Live states and provider configuration. */
export function usePeopleStatus() {
  return useQuery({ queryKey: [...PEOPLE_KEY, 'status'], queryFn: () => api<PeopleStatus>('/people/status'), staleTime: 30_000, refetchInterval: 60_000 });
}
/** Authenticated People request using the current session token (null for signed-out visitors). */
export function usePeopleCall() {
  const { token } = useSession();
  return useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => api<T>(path, { token: await token(), method, body }), [token]);
}

/** Authenticated binary GET (private 3D preview files). */
export function usePeopleBlob() {
  const { token } = useSession();
  return useCallback(async (path: string): Promise<Blob> => {
    const t = await token(); const res = await fetch(`${API_BASE}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, credentials: 'omit' });
    if (!res.ok) throw new Error('The preview could not be loaded. Retry.'); return res.blob();
  }, [token]);
}

const MESSAGES: Record<string, string> = {
  ADULT_CONSENT_REQUIRED: 'Confirm you’re 18+ first (step 1).',
  VIEW_INVALID: 'That photo angle isn’t recognised.',
  UNSUPPORTED_IMAGE: 'That file isn’t a photo we can read. Try another.',
  IMAGE_RESOLUTION: 'That photo is too small. Use a sharper photo (at least 720 px).',
  IMAGE_QUALITY: 'Too blurry, dark or bright. Face a window and retake.',
  IMAGE_NOT_VALIDATED: 'That photo couldn’t be read. Retake it.',
  MEDIA_VALIDATION_UNAVAILABLE: 'Our photo check is busy. Tap retry, your progress is saved.',
  PHOTO_CHILD: 'People is for adults only.',
  PHOTO_NOT_CLOTHED: 'Please retake fully clothed.',
  PHOTO_OF_SCREEN: 'That looks like a photo of a screen or print. Use your live camera.',
  PHOTO_MULTIPLE_PEOPLE: 'Only you in the frame, please.',
  PHOTO_NO_PERSON: 'We couldn’t see a person. Step into the frame and retake.',
  PHOTO_NO_FACE: 'We couldn’t see your face clearly. Remove hats or glasses and retake.',
  RECONSTRUCTION_NOT_CONFIGURED: 'The 3D engine is offline right now. Try again later.',
  MODEL_JOB_ACTIVE: 'Your 3D double is already being built.',
  MODEL_ATTEMPTS_USED: 'You’ve used all 3 builds for this draft. Start a new draft or ask support.',
  PEOPLE_MODEL_BUDGET_REACHED: 'Today’s 3D builds are used up. Your photos are saved: try again tomorrow.',
  MODEL_NOT_READY: 'The preview isn’t ready yet.',
  CAPTURE_STORAGE_MISSING: 'A photo went missing. Retake it and try again.',
  PROVIDER_FAILED: 'The 3D engine couldn’t build this one. Try again (this doesn’t use up a build).',
  PROVIDER_TIMEOUT: 'The 3D engine took too long. Try again (this doesn’t use up a build).',
  PROVIDER_CREDITS: 'The 3D engine is paused. Try again later (this doesn’t use up a build).',
  PROVIDER_RATE_LIMIT: 'The 3D engine is busy. Try again in a minute.',
  PROVIDER_UNAVAILABLE: 'The 3D engine didn’t answer. Try again.',
  PROVIDER_REJECTED_INPUT: 'The 3D engine rejected these photos. Retake them in better light.',
  PROVIDER_SUBMISSION_UNCERTAIN: 'We lost contact with the 3D engine mid-request. Try again.',
  SIGN_IN_REQUIRED: 'Sign in first. Drafts are private to your account.',
  SELF_DRAFT_EXISTS: 'You already have a self-launch draft. Resume it below.',
  DISPLAY_NAME_INVALID: 'Use a display name of 2–60 characters.',
  SUBJECT_ONLY: 'Only the person this profile is about can do this.',
  DRAFT_LOCKED: 'This draft is locked because it’s published or withdrawn.',
  DRAFT_WITHDRAWN: 'This draft was withdrawn.',
  X_ACCOUNT_REQUIRED: 'Link your X account to your ObjectPad sign-in first, then bind it here.',
  SUBJECT_ALREADY_CLAIMED: 'This X account already has a canonical People profile. If that’s wrong, file an appeal.',
  WALLET_INVALID: 'That wallet address isn’t valid.',
  SIGNATURE_INVALID: 'The signature didn’t match this wallet. Nothing was saved.',
  CHALLENGE_EXPIRED: 'That signing request expired. Start again.',
  CHALLENGE_REPLAYED: 'That signing request was already used. Start again.',
  CHALLENGE_INVALID: 'That signing request isn’t valid on this site. Start again.',
  WALLET_BOUND_ELSEWHERE: 'This wallet already belongs to another People profile.',
  WALLET_PROOF_REQUIRED: 'Prove your wallet first. Fees can only go to a wallet you signed for.',
  COLLABORATOR_WALLET_REQUIRED: 'The collaborator has no wallet yet. Set their share to 0% or ask them to sign in once.',
  FEE_POLICY_STALE: 'The split or wallet changed while you were signing. Sign the new version.',
  LIVENESS_NOT_CONFIGURED: 'Liveness checks aren’t available yet: no verification provider is contracted.',
  VERIFICATION_CONSENT_REQUIRED: 'Give verification-processing consent first.',
  INVITATION_INVALID: 'This invitation link isn’t valid.',
  INVITATION_REVOKED: 'This invitation was revoked by its creator.',
  INVITATION_USED: 'This invitation was already used.',
  INVITATION_EXPIRED: 'This invitation expired. Ask for a new one.',
  CANNOT_ACCEPT_OWN_INVITATION: 'You created this invitation, so you can’t accept it. Only the subject can.',
  SUBJECT_ALREADY_ACCEPTED: 'Someone already accepted this draft.',
  ACCOUNT_CHANGED: 'The X account you’re signed in with isn’t the one bound to this draft.',
  DUPLICATE_SUBJECT_REVIEW: 'A profile already exists for this person or wallet. It’s been sent to review.',
  ALREADY_NOMINATED: 'You already nominated this account.',
  PUBLIC_ACCOUNT_REQUIRED: 'Nominations are only for public accounts. Private individuals need a direct invitation.',
  HANDLE_INVALID: 'Check the handle: letters, numbers, dots and underscores only.',
  LINK_INVALID: 'Links must be public https URLs.',
  EMAIL_INVALID: 'Check the email address.',
  APPLICATION_RECENT: 'We already have an application from this email this week.',
  CONTACT_CONSENT_REQUIRED: 'Confirm we may contact you about your application.',
  ROLES_REQUIRED: 'Pick at least one role.',
  RECIPIENT_CHANGE_REQUIRES_REVIEW: 'Changing the fee recipient on a published profile requires review.',
  SPLIT_INVALID: 'That split isn’t allowed.',
  REPORT_REASON_REQUIRED: 'Describe the problem in at least 10 characters.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and retry.',
};
/** A plain-language message for any People error. */
export function peopleError(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.code.startsWith('PHOTOS_MISSING')) { const v = error.code.split(':')[1]?.split(',') ?? []; return `Take these photos first: ${v.map(x => VIEW_GUIDE[x as CaptureView]?.title ?? x).join(', ')}.`; }
    if (error.code.startsWith('CHECKS_INCOMPLETE')) { const ids = error.code.split(':')[1]?.split(',') ?? []; return `Finish these first: ${ids.map(id => CHECK_LABELS[id as CheckId] ?? id).join(', ')}.`; }
    return MESSAGES[error.code] ?? error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Nothing was saved.';
}
export const errorCode = (error: unknown): string | null => error instanceof RequestError ? error.code : null;
