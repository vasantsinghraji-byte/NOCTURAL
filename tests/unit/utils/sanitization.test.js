/**
 * Comprehensive Test Suite for NoSQL Injection Sanitization
 *
 * Tests all attack vectors and edge cases identified in security analysis
 */

const {
  sanitizeData,
  sanitizeString,
  hasDangerousCharacters,
  sanitizeKeyName,
  detectMongoOperators,
  validateSanitization,
  MAX_RECURSION_DEPTH,
  DANGEROUS_KEYS
} = require('../../../utils/sanitization');

describe('NoSQL Sanitization', () => {
  describe('sanitizeData - Basic Functionality', () => {
    it('should return primitives unchanged', () => {
      expect(sanitizeData('test')).toBe('test');
      expect(sanitizeData(123)).toBe(123);
      expect(sanitizeData(true)).toBe(true);
      expect(sanitizeData(null)).toBe(null);
      expect(sanitizeData(undefined)).toBe(undefined);
    });

    it('should handle empty objects and arrays', () => {
      expect(sanitizeData({})).toEqual({});
      expect(sanitizeData([])).toEqual([]);
    });

    it('should preserve safe object properties', () => {
      const input = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      };

      const result = sanitizeData(input);

      expect(result).toEqual(input);
    });

    it('should handle nested safe objects', () => {
      const input = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
            zip: '10001'
          }
        }
      };

      const result = sanitizeData(input);

      expect(result).toEqual(input);
    });
  });

  describe('sanitizeData - MongoDB Operator Injection', () => {
    it('should remove $ operators from keys', () => {
      const input = {
        username: 'admin',
        password: { $ne: null }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        username: 'admin'
        // password key should be completely removed
      });
      expect(result.password).toBeUndefined();
    });

    it('should remove $where operators', () => {
      const input = {
        $where: 'this.password == "123"'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({});
    });

    it('should remove nested $where operators', () => {
      const input = {
        user: {
          $where: 'malicious code'
        }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({ user: {} });
    });

    it('should remove $gt, $lt, $gte, $lte operators', () => {
      const input = {
        age: { $gt: 18, $lt: 65 }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({});
    });

    it('should remove $regex injection attempts', () => {
      const input = {
        username: { $regex: '.*' }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({});
    });

    it('should remove $expr operators', () => {
      const input = {
        $expr: { $gt: ['$spent', '$budget'] }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({});
    });

    it('should remove $elemMatch operators', () => {
      const input = {
        tags: { $elemMatch: { $ne: 1 } }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({});
    });

    it('should remove $in and $nin operators', () => {
      const input = {
        role: { $in: ['admin', 'superuser'] }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({});
    });
  });

  describe('sanitizeData - Dot Notation Field Traversal', () => {
    it('should replace dots with underscores in keys', () => {
      const input = {
        'user.password': 'leaked'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        user_password: 'leaked'
      });
      expect(result['user.password']).toBeUndefined();
    });

    it('should handle multiple dots in key names', () => {
      const input = {
        'user.profile.admin': true
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        user_profile_admin: true
      });
    });

    it('should handle dots in nested objects', () => {
      const input = {
        data: {
          'field.name': 'value'
        }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        data: {
          field_name: 'value'
        }
      });
    });
  });

  describe('sanitizeData - Null Byte Injection', () => {
    it('should remove null bytes from key names', () => {
      const input = {
        'user\0name': 'admin'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        user_name: 'admin'
      });
    });

    it('should remove null bytes from string values', () => {
      const input = {
        username: 'admin\0'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        username: 'admin'
      });
    });
  });

  describe('sanitizeData - Prototype Pollution', () => {
    it('should remove __proto__ keys', () => {
      const input = {
        __proto__: { isAdmin: true },
        name: 'test'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({ name: 'test' });
      expect(result.__proto__).not.toHaveProperty('isAdmin');
    });

    it('should remove constructor keys', () => {
      const input = {
        constructor: { prototype: { isAdmin: true } },
        name: 'test'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({ name: 'test' });
    });

    it('should remove prototype keys', () => {
      const input = {
        prototype: { isAdmin: true },
        name: 'test'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({ name: 'test' });
    });
  });

  describe('sanitizeData - Deep Recursion Attack', () => {
    it('should handle maximum recursion depth', () => {
      // Create deeply nested object beyond MAX_RECURSION_DEPTH
      let deepObject = { value: 'data' };
      for (let i = 0; i < MAX_RECURSION_DEPTH + 5; i++) {
        deepObject = { nested: deepObject };
      }

      const result = sanitizeData(deepObject);

      // Should not throw error, should return limited depth
      expect(result).toBeDefined();
    });

    it('should not crash on circular references', () => {
      const obj = { name: 'test' };
      obj.circular = obj; // Create circular reference

      // This should be handled by depth limiting
      expect(() => sanitizeData(obj)).not.toThrow();
    });
  });

  describe('sanitizeData - Array Handling', () => {
    it('should sanitize arrays of objects', () => {
      const input = [
        { name: 'test1', $admin: true },
        { name: 'test2', $admin: false }
      ];

      const result = sanitizeData(input);

      expect(result).toEqual([
        { name: 'test1' },
        { name: 'test2' }
      ]);
    });

    it('should handle nested arrays', () => {
      const input = {
        users: [
          { name: 'user1', roles: ['admin', 'user'] },
          { name: 'user2', roles: ['user'] }
        ]
      };

      const result = sanitizeData(input);

      expect(result).toEqual(input);
    });

    it('should sanitize array elements', () => {
      const input = {
        items: [
          { name: 'item1' },
          { name: 'item2', $where: 'malicious' }
        ]
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        items: [
          { name: 'item1' },
          { name: 'item2' }
        ]
      });
    });
  });

  describe('sanitizeData - Function Injection', () => {
    it('should remove function properties', () => {
      const input = {
        name: 'test',
        malicious: function() { return 'hacked'; }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({ name: 'test' });
      expect(result.malicious).toBeUndefined();
    });

    it('should remove arrow functions', () => {
      const input = {
        name: 'test',
        malicious: () => 'hacked'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({ name: 'test' });
    });
  });

  describe('sanitizeData - Special Object Types', () => {
    it('should preserve Date objects', () => {
      const date = new Date('2024-01-01');
      const input = {
        createdAt: date
      };

      const result = sanitizeData(input);

      expect(result.createdAt).toEqual(date);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should convert RegExp to string (ReDoS prevention)', () => {
      const input = {
        pattern: /test/gi
      };

      const result = sanitizeData(input);

      expect(typeof result.pattern).toBe('string');
      expect(result.pattern).toBe('/test/gi');
    });
  });

  describe('sanitizeData - MongoDB Internal Fields', () => {
    it('should allow _id field', () => {
      const input = {
        _id: '507f1f77bcf86cd799439011',
        name: 'test'
      };

      const result = sanitizeData(input);

      expect(result._id).toBe('507f1f77bcf86cd799439011');
    });

    it('should remove other underscore-prefixed fields', () => {
      const input = {
        _id: '123',
        _admin: true,
        _superuser: true,
        name: 'test'
      };

      const result = sanitizeData(input);

      expect(result._id).toBe('123');
      expect(result.name).toBe('test');
      expect(result._admin).toBeUndefined();
      expect(result._superuser).toBeUndefined();
    });
  });

  describe('sanitizeString', () => {
    it('should remove null bytes from strings', () => {
      const result = sanitizeString('test\0string');

      expect(result).toBe('teststring');
    });

    it('should handle strings without null bytes', () => {
      const result = sanitizeString('normal string');

      expect(result).toBe('normal string');
    });
  });

  describe('hasDangerousCharacters', () => {
    it('should detect $ in keys', () => {
      expect(hasDangerousCharacters('$where')).toBe(true);
      expect(hasDangerousCharacters('user$name')).toBe(true);
    });

    it('should detect dots in keys', () => {
      expect(hasDangerousCharacters('user.name')).toBe(true);
    });

    it('should detect null bytes', () => {
      expect(hasDangerousCharacters('user\0name')).toBe(true);
    });

    it('should detect path traversal patterns', () => {
      expect(hasDangerousCharacters('../admin')).toBe(true);
    });

    it('should return false for safe keys', () => {
      expect(hasDangerousCharacters('username')).toBe(false);
      expect(hasDangerousCharacters('email')).toBe(false);
      expect(hasDangerousCharacters('_id')).toBe(false);
    });
  });

  describe('sanitizeKeyName', () => {
    it('should replace dangerous characters with underscores', () => {
      expect(sanitizeKeyName('user$name')).toBe('user_name');
      expect(sanitizeKeyName('user.name')).toBe('user_name');
      expect(sanitizeKeyName('user<name>')).toBe('user_name');
    });

    it('should remove multiple consecutive underscores', () => {
      expect(sanitizeKeyName('user$$$name')).toBe('user_name');
    });

    it('should remove leading and trailing underscores', () => {
      expect(sanitizeKeyName('$username$')).toBe('username');
    });
  });

  describe('detectMongoOperators', () => {
    it('should detect $ operators in object', () => {
      const input = {
        username: 'admin',
        password: { $ne: null }
      };

      const result = detectMongoOperators(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        operator: '$ne',
        path: 'password.$ne',
        value: null
      });
    });

    it('should detect nested operators', () => {
      const input = {
        user: {
          credentials: {
            $where: 'malicious'
          }
        }
      };

      const result = detectMongoOperators(input);

      expect(result).toHaveLength(1);
      expect(result[0].operator).toBe('$where');
    });

    it('should detect operators in arrays', () => {
      const input = [
        { $admin: true },
        { $superuser: false }
      ];

      const result = detectMongoOperators(input);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for safe objects', () => {
      const input = {
        name: 'test',
        email: 'test@example.com'
      };

      const result = detectMongoOperators(input);

      expect(result).toHaveLength(0);
    });
  });

  describe('validateSanitization', () => {
    it('should return true for safe objects', () => {
      const input = {
        name: 'test',
        email: 'test@example.com',
        age: 30
      };

      expect(validateSanitization(input)).toBe(true);
    });

    it('should return false for objects with $ operators', () => {
      const input = {
        password: { $ne: null }
      };

      expect(validateSanitization(input)).toBe(false);
    });

    it('should return false for objects with dot notation', () => {
      const input = {
        'user.password': 'leaked'
      };

      expect(validateSanitization(input)).toBe(false);
    });

    it('should return false for objects with dangerous keys', () => {
      const input = {
        __proto__: { isAdmin: true }
      };

      expect(validateSanitization(input)).toBe(false);
    });

    it('should validate nested objects', () => {
      const input = {
        user: {
          name: 'test',
          credentials: {
            $password: 'leaked'
          }
        }
      };

      expect(validateSanitization(input)).toBe(false);
    });
  });

  describe('Complex Attack Scenarios', () => {
    it('should handle combined attack vectors', () => {
      const input = {
        username: 'admin',
        password: { $ne: null },
        'user.role': 'admin',
        __proto__: { isAdmin: true },
        $where: 'this.password == "123"'
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        username: 'admin',
        user_role: 'admin'
      });
      expect(validateSanitization(result)).toBe(true);
    });

    it('should handle real-world login bypass attempt', () => {
      const input = {
        username: 'admin',
        password: { $ne: null } // Bypass: "password is not null"
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        username: 'admin'
      });
      // This would force password comparison to fail safely
    });

    it('should handle aggregation operator injection', () => {
      const input = {
        $expr: {
          $gt: ['$spent', '$budget']
        }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({});
    });

    it('should handle deeply nested operator injection', () => {
      const input = {
        user: {
          profile: {
            settings: {
              $where: 'malicious code'
            }
          }
        }
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        user: {
          profile: {
            settings: {}
          }
        }
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large objects efficiently', () => {
      const largeObject = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`field${i}`] = `value${i}`;
      }

      const start = Date.now();
      const result = sanitizeData(largeObject);
      const duration = Date.now() - start;

      expect(Object.keys(result)).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should handle empty values', () => {
      const input = {
        name: '',
        email: null,
        age: 0,
        active: false
      };

      const result = sanitizeData(input);

      expect(result).toEqual(input);
    });

    it('should handle unicode characters', () => {
      const input = {
        name: '日本語',
        emoji: '🚀',
        special: 'café'
      };

      const result = sanitizeData(input);

      expect(result).toEqual(input);
    });
  });
});
