<?php

namespace App\Services;

use ZKLib\ZKLib; // Change this to your SDK's class

class ZKTecoService
{
    protected $zk;

    public function __construct()
    {
        // Adjust IP and port based on your device's configuration
        $this->zk = new ZKLib('192.168.1.201', 4370);
        $this->zk->connect();
    }

    public function getAttendance()
    {
        return $this->zk->getAttendances(); // Fetch the attendance from the device
    }

    public function __destruct()
    {
        $this->zk->disconnect(); // Close the connection after work is done
    }
}
