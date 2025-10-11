import * as responses from '../server/responses';
import {Handler} from './Handler';
import {Context} from './IHandler';
import {Request} from '../Request';
import {Response} from '../Response';
import {isPlayerId} from '../../common/Types';
import {PushSubscriptionData} from '../player/PushSubscription';
import {Database} from '../database/Database';

export class ApiPushSubscribe extends Handler {
  public static readonly INSTANCE = new ApiPushSubscribe();

  private constructor() {
    super();
  }

  public override async post(req: Request, res: Response, ctx: Context): Promise<void> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (data) => {
        body += data.toString();
      });
      req.once('end', async () => {
        try {
          const data = JSON.parse(body);
          const playerId = data.playerId;
          const subscription: PushSubscriptionData = data.subscription;

          // Validate playerId
          if (!playerId || !isPlayerId(playerId)) {
            responses.badRequest(req, res, 'Invalid player ID');
            resolve();
            return;
          }

          // Validate subscription data
          if (!subscription || !subscription.endpoint || !subscription.keys ||
              !subscription.keys.p256dh || !subscription.keys.auth) {
            responses.badRequest(req, res, 'Invalid subscription data');
            resolve();
            return;
          }

          // Save subscription to database
          const db = Database.getInstance();
          await db.savePushSubscription(playerId, subscription);

          responses.writeJson(res, ctx, {success: true});
          resolve();
        } catch (e) {
          console.error('Error saving push subscription:', e);
          responses.internalServerError(req, res, e);
          resolve();
        }
      });
    });
  }
}
