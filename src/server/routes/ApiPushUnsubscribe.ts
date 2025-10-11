import * as responses from '../server/responses';
import {Handler} from './Handler';
import {Context} from './IHandler';
import {Request} from '../Request';
import {Response} from '../Response';
import {isPlayerId} from '../../common/Types';
import {Database} from '../database/Database';

export class ApiPushUnsubscribe extends Handler {
  public static readonly INSTANCE = new ApiPushUnsubscribe();

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
          const endpoint = data.endpoint;

          // Validate playerId
          if (!playerId || !isPlayerId(playerId)) {
            responses.badRequest(req, res, 'Invalid player ID');
            resolve();
            return;
          }

          // Validate endpoint
          if (!endpoint || typeof endpoint !== 'string') {
            responses.badRequest(req, res, 'Invalid endpoint');
            resolve();
            return;
          }

          // Delete subscription from database
          const db = Database.getInstance();
          await db.deletePushSubscription(playerId, endpoint);

          responses.writeJson(res, ctx, {success: true});
          resolve();
        } catch (e) {
          console.error('Error deleting push subscription:', e);
          responses.internalServerError(req, res, e);
          resolve();
        }
      });
    });
  }
}
