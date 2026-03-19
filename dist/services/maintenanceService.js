"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAccess = void 0;
const db_1 = require("../models/db");
const checkAccess = (memberId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield db_1.db.query('SELECT membership_active, next_maintenance_due FROM members WHERE id = $1', [memberId]);
        if (res.rowCount === 0)
            return { allowed: false, reason: "Member not found" };
        const member = res.rows[0];
        const now = new Date();
        // 1. Check if they are generally active
        // 2. Check if their maintenance date has passed
        if (!member.membership_active || (member.next_maintenance_due && now > member.next_maintenance_due)) {
            return { allowed: false, reason: "Monthly maintenance fee (500 Naira) required" };
        }
        return { allowed: true };
    }
    catch (err) {
        console.error('Error checking maintenance status:', err);
        return { allowed: false, reason: "System error" };
    }
});
exports.checkAccess = checkAccess;
