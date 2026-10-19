import { db, AuditLog } from '../db';
import crypto from 'crypto';

export class AuditService {
  public static log(params: {
    actorUserId?: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId?: string;
    details: Record<string, any>;
    ipAddress?: string;
  }): AuditLog {
    const newLog: AuditLog = {
      id: 'log_' + crypto.randomUUID().slice(0, 8),
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details,
      ipAddress: params.ipAddress,
      timestamp: new Date().toISOString(),
    };

    db.auditLogs.unshift(newLog);
    // Keep last 1,000 logs in storage
    if (db.auditLogs.length > 1000) {
      db.auditLogs = db.auditLogs.slice(0, 1000);
    }
    db.save();
    return newLog;
  }
}
