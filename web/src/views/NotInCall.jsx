import { PhoneOff } from 'lucide-react';
import { AccountMenu } from '../components/TopBar.jsx';

/**
 * Shown when there is nothing to control: the user isn't in a voice channel (no `onJoin`), or they
 * are in one but the bot isn't in a call on that server (`onJoin` brings it over).
 */
export function NotInCall({ me, onJoin, joining }) {
  return (
    <main className="empty-call">
      <div className="empty-top"><AccountMenu me={me} /></div>
      <div className="empty-body route-fade">
        <div className="empty-icon"><PhoneOff size={22} /></div>
        <h1>The bot is not in a call</h1>
        <p>Nothing is playing in this server. Bring it in, or start something with a command in Discord.</p>
        {onJoin ? <button className="join-btn" onClick={onJoin} disabled={joining}>{joining ? 'Joining…' : 'Bring the bot here'}</button> : null}
      </div>
    </main>
  );
}
