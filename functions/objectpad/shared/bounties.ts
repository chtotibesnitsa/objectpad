/** Paid Rewards: one-off cash bounties for the first real scan of a specific object. Mirrored in the web app. */
export interface Bounty {
  id: string; title: string; object: string; rewardUsd: number; image: string; tagline: string;
  rules: string[]; adult?: boolean; postedAt: string; xUrl?: string; winner?: BountyWinner;
}
/** A manually confirmed winner. Only verified facts: coin, token and scanner wallet are on-chain; handle and postUrl are added only once confirmed. */
export interface BountyWinner {
  handle?: string; name?: string; avatar: string; postUrl?: string; coinName: string; coinUrl: string; token: string; creatorWallet: string; paid: boolean;
}

export const BOUNTIES: Bounty[] = [
  { id: 'payphone', title: 'First Payphone Scan', object: 'Payphone', rewardUsd: 250, image: '/assets/bounties/payphone-1280.webp', tagline: 'Find a real street payphone, scan it and launch its coin.', rules: ['A real, physical payphone, scanned in person', 'Launched as a coin on ObjectPad', 'First approved coin wins'], postedAt: '2026-09-24',
    winner: { avatar: '/assets/bounties/theoix-avatar.png', coinName: 'Payphone ($PP)', creatorWallet: '0x8116b15817a8362c851d9a70b5aa915110fca9ae', coinUrl: 'https://www.objectpad.fun/objects/ac49eb496ed37b84629b1cab3ea5201a3c7e87ede3d785e0974db7462e1d7a74', token: '0x0f3a1e8e1a76c1d2e58aab5913e92a2846576e73', paid: true } },
  { id: 'singing-fish', title: 'First Singing Fish Scan', object: 'Singing fish (Big Mouth Billy Bass)', rewardUsd: 250, image: '/assets/bounties/singing-fish-1280.webp', tagline: 'The wall-mounted singing bass. Original object, live capture.', rules: ['An original singing fish, scanned live', 'No photos of screens or printouts', 'First approved coin wins'], postedAt: '2026-09-25' },
  { id: 'toy-18', title: 'First D*ldo Scan', object: 'Adult toy', rewardUsd: 100, image: '/assets/bounties/d-ldo-1280.webp', tagline: 'Yes, really. 18+ only. Original scans only.', rules: ['18+ only', 'Your own original scan of a real object', 'First approved coin wins'], adult: true, postedAt: '2026-09-25' },
];

export const bountyById = (id: string): Bounty | undefined => BOUNTIES.find(b => b.id === id);
