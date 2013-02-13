vmmanager
===========

vmmanager is a Node.js based daemon in charge of managing virtual machines in a netlab environment. It uses AMQP to attend requests for creating and amnaging workspaces. vmmanager can

* Start virtual machines
* Stop virtual machines
* Manage workspaces

Drivers
-------
vmmanager needs drivers to work with specific virtualization frameworks. Drivers supported until now are:

* Netkit (http://wiki.netkit.org)

