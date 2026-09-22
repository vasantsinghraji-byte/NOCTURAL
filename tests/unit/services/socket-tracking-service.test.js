const socketTrackingService = require('../../../services/socketTrackingService');

describe('SocketTrackingService', () => {
  let mockIo;
  let mockSocket;
  let eventHandlers;

  beforeEach(() => {
    eventHandlers = {};
    mockSocket = {
      id: 'mock-socket-1',
      join: jest.fn(),
      leave: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      on: jest.fn((event, cb) => {
        eventHandlers[event] = cb;
      })
    };

    mockIo = {
      on: jest.fn((event, cb) => {
        if (event === 'connection') {
          cb(mockSocket);
        }
      }),
      to: jest.fn().mockReturnValue({
        emit: jest.fn()
      })
    };

    socketTrackingService.initialize(mockIo);
  });

  test('handles join:booking and leave:booking events', () => {
    eventHandlers['join:booking']('booking-123');
    expect(mockSocket.join).toHaveBeenCalledWith('booking:booking-123');

    eventHandlers['leave:booking']('booking-123');
    expect(mockSocket.leave).toHaveBeenCalledWith('booking:booking-123');
  });

  test('handles join:user and join:consultation', () => {
    eventHandlers['join:user']('user-456');
    expect(mockSocket.join).toHaveBeenCalledWith('user:user-456');

    eventHandlers['join:consultation']('con-789');
    expect(mockSocket.join).toHaveBeenCalledWith('consultation:con-789');
  });

  test('notifies emergency dispatch via room emit', () => {
    const emitSpy = jest.fn();
    mockIo.to = jest.fn().mockReturnValue({ emit: emitSpy });

    socketTrackingService.notifyEmergencyDispatch('staff-1', { emergencyNumber: 'SOS-123' });
    expect(mockIo.to).toHaveBeenCalledWith('user:staff-1');
    expect(emitSpy).toHaveBeenCalledWith('emergency:new_dispatch', { emergencyNumber: 'SOS-123' });
  });
});
