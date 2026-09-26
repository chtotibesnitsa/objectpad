import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, type ReactNode } from 'react';
import { createWalletClient, custom, type Address } from 'viem';
import { robinhoodChain } from '@/shared/pons';
import { PRIVY_APP_ID, useSession, type LoginMethod } from './session';

function Bridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken, linkTwitter } = usePrivy(); const { wallets, ready: walletReady } = useWallets(); const { setAdapter } = useSession();
  // Prefer an external wallet the creator connected (MetaMask etc.); fall back to the embedded wallet.
  const wallet = wallets.find(w => w.walletClientType !== 'privy') ?? wallets[0];
  useEffect(() => { setAdapter({ ready: ready && walletReady, authenticated, wallet: wallet?.address as Address ?? null, login: (methods?: LoginMethod[]) => login(methods?.length ? { loginMethods: methods } : undefined), logout: () => { void logout(); }, token: getAccessToken, linkX: () => { linkTwitter(); },
    sign: async message => { if (!wallet) throw new Error('Connect a wallet.'); const client = createWalletClient({ account: wallet.address as Address, transport: custom(await wallet.getEthereumProvider()) }); return client.signMessage({ message }); },
    send: async input => { if (!wallet) throw new Error('Connect a wallet.'); await wallet.switchChain(4663); const client = createWalletClient({ account: wallet.address as Address, chain: robinhoodChain, transport: custom(await wallet.getEthereumProvider()) }); return client.sendTransaction({ ...input, chain: robinhoodChain }); },
  }); }, [ready, walletReady, authenticated, wallet, login, logout, getAccessToken, linkTwitter, setAdapter]);
  return children;
}
export default function ConnectedAuth({ children }: { children: ReactNode }) {
  return <PrivyProvider appId={PRIVY_APP_ID} config={{ appearance: { theme: 'light', accentColor: '#0C0D10', logo: '/icon.png', landingHeader: 'Sign in to ObjectPad', loginMessage: 'Optional. Launching is free without an account.', walletList: ['metamask', 'coinbase_wallet', 'rainbow', 'wallet_connect'] }, supportedChains: [robinhoodChain], defaultChain: robinhoodChain, loginMethods: ['twitter', 'wallet', 'email'], embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } } }}><Bridge>{children}</Bridge></PrivyProvider>;
}
